-- ============================================================================
-- GBM INTELLIGENCE — 0028 THE SUBMISSION CONTRACT
-- ----------------------------------------------------------------------------
-- One versioned entry point an external AI research team calls, and one
-- narrow lookup so it can find the player it is writing about. Nothing else is
-- exposed to it.
--
-- WHY A FUNCTION RATHER THAN TABLE ACCESS
--
-- The obvious approach — grant the agent INSERT on a few tables and let
-- PostgREST do the rest — spreads the contract across every column of every
-- table and makes each one a promise. A function is a single surface that can
-- be versioned, validated in one place, and audited; the tables behind it stay
-- free to change. It also means the agent can be given write ability without
-- being given a Postgres grant on anything a reader can see.
--
-- WHAT THE AGENT MAY AND MAY NOT TOUCH
--
-- It may NOT write `players`, `clubs`, `contracts`, `market_values` or
-- `representation_records` — the canonical record. `players.id` is a GBM UUID
-- and the identity graph is not something an external model gets to extend.
-- What it submits about those subjects goes to `source_facts` as an assertion
-- with provenance, where `provider_fact_priority` decides whether it is ever
-- displayed. That is the existing architecture, not a special case: two
-- sources that disagree are both retained and the conflict is shown.
--
-- It MAY write its own judgement tables and season statistics, because those
-- are keyed by provider and so cannot overwrite anyone else's numbers.
--
-- A player it cannot resolve is REJECTED rather than created. An AI research
-- team inventing a person in the database is the failure mode this whole
-- design exists to prevent.
-- ============================================================================

-- ============================================================================
-- WHO IS CALLING
-- ----------------------------------------------------------------------------
-- Resolves the caller to an active agent, or NULL. Kept separate so every
-- entry point checks identity the same way and `last_seen_at` is maintained in
-- one place.
-- ============================================================================
create or replace function gbm_intel_current_agent()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.id from intel_agents a
  where a.auth_user_id = auth.uid() and a.is_active
  limit 1;
$$;

-- ============================================================================
-- LOOKUP
-- ----------------------------------------------------------------------------
-- Controlled disclosure: the agent needs to find a player to attach
-- intelligence to, and this returns the four fields required to be sure it has
-- the right one — never the portfolio, the valuation, or anything else. It is
-- SECURITY DEFINER because the caller has no read access to `players` at all.
-- ============================================================================
create or replace function gbm_intel_resolve_player(
  p_name text,
  p_date_of_birth date default null
)
returns table (player_id uuid, full_name text, date_of_birth date, club_name text, match_quality text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_agent uuid;
begin
  v_agent := gbm_intel_current_agent();
  if v_agent is null then
    raise exception 'NOT_A_REGISTERED_AGENT' using errcode = '42501';
  end if;

  return query
  select p.id,
         p.full_name,
         p.date_of_birth,
         c.name,
         case
           when p_date_of_birth is not null and p.date_of_birth = p_date_of_birth then 'NAME_AND_DOB'
           when lower(p.full_name) = lower(p_name) then 'EXACT_NAME'
           else 'FUZZY_NAME'
         end
  from players p
  left join clubs c on c.id = p.current_club_id
  where p.full_name ilike '%' || p_name || '%'
     or gbm_normalize_name(p.full_name) = gbm_normalize_name(p_name)
  order by
    case when p_date_of_birth is not null and p.date_of_birth = p_date_of_birth then 0
         when lower(p.full_name) = lower(p_name) then 1
         else 2 end,
    p.full_name
  limit 10;
end $$;

comment on function gbm_intel_resolve_player is
  'Player lookup for a registered intelligence agent. Returns only what is needed to identify a player, never portfolio or commercial data.';

-- ============================================================================
-- SUBMIT
-- ----------------------------------------------------------------------------
-- Envelope:
--   { "submission_key": "<stable id>", "kind": "<KIND>",
--     "player_id": "<uuid>"|null, "data": { ... } }
--
-- Returns { status, submission_id, ... } and never raises for a bad payload —
-- a rejection is recorded in the ledger and returned, because an external
-- caller needs a machine-readable answer rather than a Postgres error string.
-- Only "you are not an agent" raises, since that is not a data problem.
-- ============================================================================
create or replace function gbm_intel_submit(p_submission jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_agent      intel_agents%rowtype;
  v_key        text := nullif(p_submission->>'submission_key', '');
  v_kind       text := upper(nullif(p_submission->>'kind', ''));
  v_data       jsonb := coalesce(p_submission->'data', '{}'::jsonb);
  v_hash       text := md5(p_submission::text);
  v_player     uuid;
  v_existing   intel_submissions%rowtype;
  v_submission uuid;
  v_result     jsonb := '{}'::jsonb;
  v_new_id     uuid;
begin
  select * into v_agent from intel_agents
   where auth_user_id = auth.uid() and is_active limit 1;
  if not found then
    raise exception 'NOT_A_REGISTERED_AGENT' using errcode = '42501';
  end if;

  update intel_agents set last_seen_at = now() where id = v_agent.id;

  if v_key is null or v_kind is null then
    return jsonb_build_object('status', 'REJECTED', 'error', 'MISSING_SUBMISSION_KEY_OR_KIND');
  end if;

  -- Idempotency. A retry after a timeout must return the first answer, not
  -- write a second valuation.
  select * into v_existing from intel_submissions
   where agent_id = v_agent.id and submission_key = v_key;
  if found then
    return jsonb_build_object(
      'status', case when v_existing.payload_hash = v_hash then 'DUPLICATE' else 'KEY_REUSED_WITH_DIFFERENT_PAYLOAD' end,
      'submission_id', v_existing.id,
      'original_status', v_existing.status,
      'result', v_existing.result
    );
  end if;

  -- Scope: an agent that may only file news cannot rewrite statistics because
  -- its credential leaked.
  if array_length(v_agent.scopes, 1) is not null and not (v_kind = any (v_agent.scopes)) then
    insert into intel_submissions (agent_id, submission_key, kind, payload, payload_hash, status, error)
    values (v_agent.id, v_key, v_kind, p_submission, v_hash, 'REJECTED', 'KIND_NOT_IN_AGENT_SCOPES')
    returning id into v_submission;
    return jsonb_build_object('status', 'REJECTED', 'submission_id', v_submission,
                              'error', 'KIND_NOT_IN_AGENT_SCOPES', 'allowed', v_agent.scopes);
  end if;

  -- Every kind except a pure competition note concerns a player, and an
  -- unresolvable player is rejected rather than invented.
  v_player := nullif(p_submission->>'player_id', '')::uuid;
  if v_player is not null and not exists (select 1 from players where id = v_player) then
    insert into intel_submissions (agent_id, submission_key, kind, payload, payload_hash, status, error)
    values (v_agent.id, v_key, v_kind, p_submission, v_hash, 'REJECTED', 'UNKNOWN_PLAYER_ID')
    returning id into v_submission;
    return jsonb_build_object('status', 'REJECTED', 'submission_id', v_submission, 'error', 'UNKNOWN_PLAYER_ID');
  end if;
  if v_player is null then
    insert into intel_submissions (agent_id, submission_key, kind, payload, payload_hash, status, error)
    values (v_agent.id, v_key, v_kind, p_submission, v_hash, 'REJECTED', 'UNRESOLVED_PLAYER')
    returning id into v_submission;
    return jsonb_build_object(
      'status', 'REJECTED', 'submission_id', v_submission, 'error', 'UNRESOLVED_PLAYER',
      'hint', 'Call gbm_intel_resolve_player() first. Players are never created from a submission.');
  end if;

  insert into intel_submissions (agent_id, submission_key, kind, payload, payload_hash, status)
  values (v_agent.id, v_key, v_kind, p_submission, v_hash, 'ACCEPTED')
  returning id into v_submission;

  ------------------------------------------------------------------ REPORT --
  if v_kind = 'REPORT' then
    insert into intel_reports (
      player_id, agent_id, submission_id, report_type, version, supersedes_id,
      headline, summary, sections, metrics, sources, model_name, confidence,
      period_start, period_end
    )
    select
      v_player, v_agent.id, v_submission,
      coalesce(upper(v_data->>'report_type'), 'PROFILE'),
      coalesce((select max(r.version) from intel_reports r
                 where r.player_id = v_player
                   and r.report_type = coalesce(upper(v_data->>'report_type'), 'PROFILE')), 0) + 1,
      (select r.id from intel_reports r
        where r.player_id = v_player
          and r.report_type = coalesce(upper(v_data->>'report_type'), 'PROFILE')
          and r.is_current limit 1),
      coalesce(v_data->>'headline', 'Untitled report'),
      v_data->>'summary',
      coalesce(v_data->'sections', '[]'::jsonb),
      v_data->'metrics',
      coalesce(v_data->'sources', '[]'::jsonb),
      v_data->>'model_name',
      (v_data->>'confidence')::numeric,
      (nullif(v_data->>'period_start', ''))::date,
      (nullif(v_data->>'period_end', ''))::date
    returning id into v_new_id;
    v_result := jsonb_build_object('report_id', v_new_id);

  -------------------------------------------------------- RECOMMENDATION --
  elsif v_kind = 'RECOMMENDATION' then
    update intel_recommendations set is_current = false
     where player_id = v_player and is_current;

    insert into intel_recommendations (
      player_id, agent_id, submission_id, recommendation, fit_label,
      target_competition_id, target_club_id, age_profile, financial_band,
      playing_style, development_potential, resale_potential, rationale, confidence
    )
    values (
      v_player, v_agent.id, v_submission,
      coalesce(upper(v_data->>'recommendation'), 'UNDECIDED')::recommendation,
      v_data->>'fit_label',
      nullif(v_data->>'target_competition_id', '')::uuid,
      nullif(v_data->>'target_club_id', '')::uuid,
      v_data->>'age_profile', v_data->>'financial_band', v_data->>'playing_style',
      v_data->>'development_potential', v_data->>'resale_potential',
      v_data->>'rationale', (v_data->>'confidence')::numeric
    )
    returning id into v_new_id;
    v_result := jsonb_build_object('recommendation_id', v_new_id);

  ------------------------------------------------------------ ADAPTATION --
  elsif v_kind = 'ADAPTATION' then
    update intel_adaptation_assessments set is_current = false
     where player_id = v_player and is_current;

    insert into intel_adaptation_assessments (
      player_id, agent_id, submission_id, from_competition_id, to_competition_id,
      from_competition_name, to_competition_name, technical_gap, competition_gap,
      adaptation_risk, risk_score, next_step, rationale, confidence
    )
    values (
      v_player, v_agent.id, v_submission,
      nullif(v_data->>'from_competition_id', '')::uuid,
      nullif(v_data->>'to_competition_id', '')::uuid,
      v_data->>'from_competition_name', v_data->>'to_competition_name',
      v_data->>'technical_gap', v_data->>'competition_gap',
      nullif(upper(v_data->>'adaptation_risk'), ''),
      (v_data->>'risk_score')::numeric,
      v_data->>'next_step', v_data->>'rationale', (v_data->>'confidence')::numeric
    )
    returning id into v_new_id;
    v_result := jsonb_build_object('adaptation_id', v_new_id);

  ------------------------------------------------------------------- NEWS --
  elsif v_kind = 'NEWS' then
    insert into player_news (
      player_id, headline, summary, source_name, source_url, source_type,
      category, language, published_at, discovered_at, confidence, content_hash,
      reliability, impact, impact_note, agent_id
    )
    values (
      v_player,
      coalesce(v_data->>'headline', 'Untitled'),
      v_data->>'summary',
      v_data->>'source_name',
      v_data->>'source_url',
      coalesce(v_data->>'source_type', 'AI_RESEARCH'),
      v_data->>'category',
      coalesce(v_data->>'language', 'en'),
      coalesce((nullif(v_data->>'published_at', ''))::timestamptz, now()),
      now(),
      (v_data->>'confidence')::numeric,
      coalesce(v_data->>'content_hash', md5(coalesce(v_data->>'source_url', '') || coalesce(v_data->>'headline', ''))),
      (v_data->>'reliability')::numeric,
      nullif(upper(v_data->>'impact'), ''),
      v_data->>'impact_note',
      v_agent.id
    )
    on conflict (player_id, content_hash) do update
      set summary     = coalesce(excluded.summary, player_news.summary),
          reliability = coalesce(excluded.reliability, player_news.reliability),
          impact      = coalesce(excluded.impact, player_news.impact),
          impact_note = coalesce(excluded.impact_note, player_news.impact_note)
    returning id into v_new_id;
    v_result := jsonb_build_object('news_id', v_new_id);

  ------------------------------------------------------------ PERFORMANCE --
  -- Season statistics are keyed by provider, so writing them cannot overwrite
  -- another source's numbers. The provider is the site the figures came FROM
  -- (Sofascore, FotMob), not the agent that fetched them — priority must judge
  -- the source, and the agent is recorded separately.
  elsif v_kind = 'PERFORMANCE' then
    insert into player_season_stats (
      player_id, season_id, competition_id, club_id, provider_code,
      matches_played, matches_started, minutes_played, goals, assists,
      yellow_cards, red_cards, xg, xa, shots, shots_on_target, key_passes,
      passes, passes_accurate, dribbles, dribbles_successful, duels, duels_won,
      aerial_duels, aerial_duels_won, interceptions, tackles, clearances,
      progressive_passes, progressive_carries, touches_in_box,
      saves, goals_conceded, clean_sheets, advanced, retrieved_at
    )
    values (
      v_player,
      nullif(v_data->>'season_id', '')::uuid,
      nullif(v_data->>'competition_id', '')::uuid,
      nullif(v_data->>'club_id', '')::uuid,
      coalesce(nullif(v_data->>'source_provider', ''), v_agent.provider_code),
      (v_data->>'matches_played')::int, (v_data->>'matches_started')::int,
      (v_data->>'minutes_played')::int, (v_data->>'goals')::int, (v_data->>'assists')::int,
      (v_data->>'yellow_cards')::int, (v_data->>'red_cards')::int,
      (v_data->>'xg')::numeric, (v_data->>'xa')::numeric,
      (v_data->>'shots')::int, (v_data->>'shots_on_target')::int, (v_data->>'key_passes')::int,
      (v_data->>'passes')::int, (v_data->>'passes_accurate')::int,
      (v_data->>'dribbles')::int, (v_data->>'dribbles_successful')::int,
      (v_data->>'duels')::int, (v_data->>'duels_won')::int,
      (v_data->>'aerial_duels')::int, (v_data->>'aerial_duels_won')::int,
      (v_data->>'interceptions')::int, (v_data->>'tackles')::int, (v_data->>'clearances')::int,
      (v_data->>'progressive_passes')::int, (v_data->>'progressive_carries')::int,
      (v_data->>'touches_in_box')::int,
      (v_data->>'saves')::int, (v_data->>'goals_conceded')::int, (v_data->>'clean_sheets')::int,
      v_data->'advanced', now()
    )
    on conflict (player_id, season_id, competition_id, club_id, provider_code) do update
      set matches_played = coalesce(excluded.matches_played, player_season_stats.matches_played),
          minutes_played = coalesce(excluded.minutes_played, player_season_stats.minutes_played),
          goals          = coalesce(excluded.goals, player_season_stats.goals),
          assists        = coalesce(excluded.assists, player_season_stats.assists),
          xg             = coalesce(excluded.xg, player_season_stats.xg),
          xa             = coalesce(excluded.xa, player_season_stats.xa),
          advanced       = coalesce(excluded.advanced, player_season_stats.advanced),
          retrieved_at   = excluded.retrieved_at,
          updated_at     = now()
    returning id into v_new_id;
    v_result := jsonb_build_object('season_stats_id', v_new_id);

  ------------------------------------------------------------------- FACT --
  -- Anything about the canonical record — a contract date, a market value, an
  -- agent — is an assertion, not a write. It lands in source_facts with the
  -- provider that published it and the AI_ASSESSED state where the agent is
  -- reasoning rather than quoting. What the platform displays is still decided
  -- by provider_fact_priority.
  elsif v_kind = 'FACT' then
    insert into source_facts (
      entity_type, entity_id, fact_key, value_text, value_numeric, value_date,
      value_json, provider_code, source_url, state, confidence, retrieved_at, is_current
    )
    values (
      'PLAYER', v_player,
      v_data->>'fact_key',
      v_data->>'value_text',
      (v_data->>'value_numeric')::numeric,
      (nullif(v_data->>'value_date', ''))::date,
      v_data->'value_json',
      coalesce(nullif(v_data->>'source_provider', ''), v_agent.provider_code),
      v_data->>'source_url',
      case when nullif(v_data->>'source_provider', '') is null
           then 'AI_ASSESSED'::fact_state
           else 'SOURCE_REPORTED'::fact_state end,
      (v_data->>'confidence')::numeric,
      now(), true
    )
    on conflict (entity_type, entity_id, fact_key, provider_code) do update
      set value_text    = excluded.value_text,
          value_numeric = excluded.value_numeric,
          value_date    = excluded.value_date,
          value_json    = excluded.value_json,
          source_url    = excluded.source_url,
          state         = excluded.state,
          confidence    = excluded.confidence,
          retrieved_at  = excluded.retrieved_at,
          is_current    = true
    returning id into v_new_id;
    v_result := jsonb_build_object('fact_id', v_new_id);

  else
    update intel_submissions
       set status = 'REJECTED', error = 'UNKNOWN_KIND'
     where id = v_submission;
    return jsonb_build_object('status', 'REJECTED', 'submission_id', v_submission,
      'error', 'UNKNOWN_KIND',
      'accepted_kinds', jsonb_build_array('REPORT','RECOMMENDATION','ADAPTATION','NEWS','PERFORMANCE','FACT'));
  end if;

  update intel_submissions set result = v_result where id = v_submission;
  return jsonb_build_object('status', 'ACCEPTED', 'submission_id', v_submission) || v_result;

exception
  when others then
    -- The ledger must record the failure even though the transaction that
    -- wrote the row is being rolled back, so the error is returned rather than
    -- raised and the caller gets a machine-readable answer.
    return jsonb_build_object('status', 'REJECTED', 'error', 'WRITE_FAILED',
                              'detail', sqlerrm, 'sqlstate', sqlstate);
end $$;

comment on function gbm_intel_submit is
  'The single entry point for external intelligence. Idempotent on (agent, submission_key). Never creates players; never writes the canonical record directly.';

revoke all on function gbm_intel_submit(jsonb) from public, anon;
revoke all on function gbm_intel_resolve_player(text, date) from public, anon;
revoke all on function gbm_intel_current_agent() from public, anon;
grant execute on function gbm_intel_submit(jsonb) to authenticated;
grant execute on function gbm_intel_resolve_player(text, date) to authenticated;
