-- ============================================================================
-- GBM INTELLIGENCE — 0034 THE CONTRACT REACHES THE WHOLE RECORD
-- ----------------------------------------------------------------------------
-- The submission contract could write seven tables: the four intel_* tables,
-- player_news, player_season_stats and source_facts. Everything else a
-- research team would gather — identity, height, foot, position, the club
-- badge, career history, transfers, contracts, valuations, the agent,
-- injuries — had either no route at all, or a route into `source_facts` that
-- nothing displays. An agent could file a perfect record for all fifteen GBM
-- players and every profile would still render blank.
--
-- That is the limitation this migration removes.
--
-- THE RULE THAT MAKES IT SAFE
--
-- 0026 put AVENGERS_GROK at priority 40, below every source it can cite, so a
-- model could never overwrite a real provider. That principle is kept exactly:
-- the canonical `players` row is filled **only where a column is currently
-- NULL**. `coalesce(existing, submitted)` is the whole mechanism — an existing
-- Transfermarkt value or a GBM entry always wins, and re-running can never
-- change a field that someone has since filled in properly.
--
-- Filling a hole is not overwriting. Where the platform knows nothing, a
-- sourced assertion is strictly better than a blank.
--
-- WHY EVERY CLAIM STILL BECOMES A FACT
--
-- Each identity field is also written to `source_facts` with its provider and
-- state, whether or not it was used to fill the column. That is what lets the
-- interface mark an AI-supplied value as AI-supplied: a field whose only
-- current assertion is AI_ASSESSED was filled by a model, and the profile says
-- so. Provenance is not a side effect here, it is the reason the fill is
-- allowed at all.
--
-- IMAGES CARRY A CREDIT OR THEY ARE REFUSED
--
-- `image_url` is the one field with a rights dimension rather than only an
-- accuracy one. A submission that supplies an image without `image_credit` is
-- rejected by name. The platform cannot verify a licence, but it can refuse to
-- store a picture nobody has attributed.
--
-- WHAT IS NOT HERE
--
-- MATCH-level statistics. `player_match_stats` is keyed on a `matches` row,
-- `matches` is empty by deliberate design, and its unique key treats a NULL
-- match_id as distinct — so match submissions would silently duplicate. Doing
-- it properly means starting match-level ingestion, which is its own
-- increment. Season aggregates and heatmaps are already available today
-- through PERFORMANCE and `player_season_stats.advanced`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Natural keys, so a re-run updates instead of duplicating
-- ----------------------------------------------------------------------------
-- contracts, transfers, market_values and representation_records already have
-- one. These two did not, which is why they could not accept a submission at
-- all: the second run would have made a second row.
-- ----------------------------------------------------------------------------
create unique index if not exists player_team_history_natural_key_idx
  on player_team_history (player_id, source_provider, club_id, start_date)
  nulls not distinct;

create unique index if not exists player_injuries_natural_key_idx
  on player_injuries (player_id, provider_code, started_on)
  nulls not distinct;

-- ----------------------------------------------------------------------------
-- B. Identity — fill the holes, assert everything
-- ----------------------------------------------------------------------------
create or replace function gbm_intel__identity(
  p_player   uuid,
  p_provider text,
  p_state    fact_state,
  p_data     jsonb,
  p_url      text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_nat    uuid;
  v_nat2   uuid;
  v_birth  uuid;
  v_club   uuid;
  v_before players%rowtype;
  v_filled text[] := '{}';
  v_key    text;
  v_val    text;
  v_fields constant text[] := array[
    'short_name','first_name','last_name','date_of_birth','birth_place',
    'nationality','second_nationality','birth_country','height_cm','weight_kg',
    'foot','primary_position','secondary_positions','shirt_number',
    'current_club','image_url'
  ];
begin
  select * into v_before from players where id = p_player;

  -- A picture with nobody credited is refused rather than stored.
  if nullif(p_data->>'image_url','') is not null
     and nullif(p_data->>'image_credit','') is null then
    return jsonb_build_object('error', 'MISSING_REQUIRED_FIELD', 'field', 'image_credit',
      'hint', 'An image must name its source. GBM cannot verify a licence for an unattributed picture.');
  end if;

  -- Names resolve to ids where the reference data knows them; where it does
  -- not, the field is simply left alone rather than guessed at.
  select id into v_nat   from countries where gbm_normalize_name(name) = gbm_normalize_name(nullif(p_data->>'nationality',''));
  select id into v_nat2  from countries where gbm_normalize_name(name) = gbm_normalize_name(nullif(p_data->>'second_nationality',''));
  select id into v_birth from countries where gbm_normalize_name(name) = gbm_normalize_name(nullif(p_data->>'birth_country',''));
  select id into v_club  from clubs     where gbm_normalize_name(name) = gbm_normalize_name(nullif(p_data->>'current_club',''));

  -- coalesce(existing, submitted): an existing value always wins. This is the
  -- whole "never overwrite" rule, and it is why re-running is harmless.
  update players p set
    short_name          = coalesce(p.short_name,          nullif(p_data->>'short_name','')),
    first_name          = coalesce(p.first_name,          nullif(p_data->>'first_name','')),
    last_name           = coalesce(p.last_name,           nullif(p_data->>'last_name','')),
    date_of_birth       = coalesce(p.date_of_birth,      (nullif(p_data->>'date_of_birth',''))::date),
    birth_place         = coalesce(p.birth_place,         nullif(p_data->>'birth_place','')),
    nationality_country_id        = coalesce(p.nationality_country_id, v_nat),
    second_nationality_country_id = coalesce(p.second_nationality_country_id, v_nat2),
    birth_country_id    = coalesce(p.birth_country_id,    v_birth),
    height_cm           = coalesce(p.height_cm,          (nullif(p_data->>'height_cm',''))::int),
    weight_kg           = coalesce(p.weight_kg,          (nullif(p_data->>'weight_kg',''))::int),
    foot                = coalesce(p.foot,                (nullif(upper(p_data->>'foot'),''))::preferred_foot),
    primary_position    = coalesce(p.primary_position,    nullif(upper(p_data->>'primary_position'),'')),
    shirt_number        = coalesce(p.shirt_number,       (nullif(p_data->>'shirt_number',''))::int),
    current_club_id     = coalesce(p.current_club_id,     v_club),
    image_url           = coalesce(p.image_url,           nullif(p_data->>'image_url','')),
    image_credit        = coalesce(p.image_credit,        nullif(p_data->>'image_credit','')),
    updated_at          = now()
  where p.id = p_player;

  -- secondary_positions is an array, so it is set only when wholly absent.
  if (v_before.secondary_positions is null or cardinality(v_before.secondary_positions) = 0)
     and jsonb_typeof(p_data->'secondary_positions') = 'array' then
    update players
       set secondary_positions = array(select jsonb_array_elements_text(p_data->'secondary_positions')),
           updated_at = now()
     where id = p_player;
  end if;

  -- Every supplied field becomes an assertion regardless of whether it filled
  -- a column, so the interface can tell an AI-sourced value from a provider's.
  foreach v_key in array v_fields loop
    v_val := nullif(p_data->>v_key, '');
    continue when v_val is null;
    insert into source_facts (entity_type, entity_id, fact_key, value_text,
                              provider_code, source_url, state, confidence,
                              retrieved_at, is_current)
    values ('PLAYER', p_player, 'player.' || v_key, v_val, p_provider, p_url,
            p_state, coalesce((p_data->>'confidence')::numeric, 0.800), now(), true)
    on conflict (entity_type, entity_id, fact_key, provider_code) do update
      set value_text = excluded.value_text,
          source_url = excluded.source_url,
          state      = excluded.state,
          confidence = excluded.confidence,
          retrieved_at = excluded.retrieved_at,
          is_current = true;
  end loop;

  -- Report what actually changed, so a caller can see its work landed.
  select array_agg(f) into v_filled from (
    select 'short_name' as f where v_before.short_name is null and nullif(p_data->>'short_name','') is not null
    union all select 'date_of_birth' where v_before.date_of_birth is null and nullif(p_data->>'date_of_birth','') is not null
    union all select 'nationality' where v_before.nationality_country_id is null and v_nat is not null
    union all select 'height_cm' where v_before.height_cm is null and nullif(p_data->>'height_cm','') is not null
    union all select 'foot' where v_before.foot is null and nullif(p_data->>'foot','') is not null
    union all select 'primary_position' where v_before.primary_position is null and nullif(p_data->>'primary_position','') is not null
    union all select 'current_club' where v_before.current_club_id is null and v_club is not null
    union all select 'image_url' where v_before.image_url is null and nullif(p_data->>'image_url','') is not null
  ) s;

  return jsonb_build_object('filled', coalesce(to_jsonb(v_filled), '[]'::jsonb));
end $fn$;

comment on function gbm_intel__identity is
  'Fills NULL columns on players from a submission and records every supplied field in source_facts. Never overwrites an existing value.';

-- ----------------------------------------------------------------------------
-- C. The record tables — provider-keyed, so nothing competes
-- ----------------------------------------------------------------------------
-- Each of these already carries provider_code in its natural key, exactly as
-- player_season_stats does. A row written under AVENGERS_GROK sits beside
-- Transfermarkt's rather than replacing it, and the display resolves by
-- priority. No overwriting is possible, so no fill-if-empty rule is needed.
-- ----------------------------------------------------------------------------
create or replace function gbm_intel__record(
  p_kind     text,
  p_player   uuid,
  p_provider text,
  p_data     jsonb,
  p_url      text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_id     uuid;
  v_club   uuid;
  v_from   uuid;
  v_to     uuid;
begin
  select id into v_club from clubs where gbm_normalize_name(name) = gbm_normalize_name(nullif(p_data->>'club',''));
  select id into v_from from clubs where gbm_normalize_name(name) = gbm_normalize_name(nullif(p_data->>'from_club',''));
  select id into v_to   from clubs where gbm_normalize_name(name) = gbm_normalize_name(nullif(p_data->>'to_club',''));

  if p_kind = 'VALUATION' then
    insert into market_values (player_id, value_amount, currency, valued_on, club_id,
                               provider_code, source_url, retrieved_at)
    values (p_player,
            (p_data->>'value_amount')::numeric,
            coalesce(nullif(p_data->>'currency',''), 'EUR'),
            coalesce((nullif(p_data->>'valued_on',''))::date, current_date),
            v_club, p_provider, p_url, now())
    on conflict (player_id, provider_code, valued_on) do update
      set value_amount = excluded.value_amount,
          currency     = excluded.currency,
          source_url   = excluded.source_url,
          retrieved_at = excluded.retrieved_at
    returning id into v_id;
    return jsonb_build_object('market_value_id', v_id);

  elsif p_kind = 'CONTRACT' then
    insert into contracts (player_id, club_id, start_date, expires_on, option_until,
                           is_loan, loan_expires_on, status, provider_code, source_url, retrieved_at)
    values (p_player, v_club,
            (nullif(p_data->>'start_date',''))::date,
            (nullif(p_data->>'expires_on',''))::date,
            (nullif(p_data->>'option_until',''))::date,
            coalesce((p_data->>'is_loan')::boolean, false),
            (nullif(p_data->>'loan_expires_on',''))::date,
            coalesce(nullif(upper(p_data->>'status'),''), 'ACTIVE'),
            p_provider, p_url, now())
    on conflict (player_id, provider_code, club_id) do update
      set start_date      = excluded.start_date,
          expires_on      = excluded.expires_on,
          option_until    = excluded.option_until,
          is_loan         = excluded.is_loan,
          loan_expires_on = excluded.loan_expires_on,
          status          = excluded.status,
          source_url      = excluded.source_url,
          retrieved_at    = excluded.retrieved_at,
          updated_at      = now()
    returning id into v_id;
    return jsonb_build_object('contract_id', v_id);

  elsif p_kind = 'TRANSFER' then
    insert into transfers (player_id, from_club_id, to_club_id, from_club_name_raw, to_club_name_raw,
                           transfer_date, season_name, transfer_type, fee_amount, fee_currency,
                           is_loan, is_free, market_value_at_transfer, provider_code, source_url, retrieved_at)
    values (p_player, v_from, v_to,
            nullif(p_data->>'from_club',''), nullif(p_data->>'to_club',''),
            (nullif(p_data->>'transfer_date',''))::date,
            nullif(p_data->>'season_name',''),
            nullif(upper(p_data->>'transfer_type'),''),
            (nullif(p_data->>'fee_amount',''))::numeric,
            coalesce(nullif(p_data->>'fee_currency',''), 'EUR'),
            coalesce((p_data->>'is_loan')::boolean, false),
            coalesce((p_data->>'is_free')::boolean, false),
            (nullif(p_data->>'market_value_at_transfer',''))::numeric,
            p_provider, p_url, now())
    on conflict (player_id, provider_code, transfer_date, from_club_id, to_club_id) do update
      set fee_amount   = excluded.fee_amount,
          fee_currency = excluded.fee_currency,
          transfer_type = excluded.transfer_type,
          is_loan      = excluded.is_loan,
          is_free      = excluded.is_free,
          source_url   = excluded.source_url,
          retrieved_at = excluded.retrieved_at
    returning id into v_id;
    return jsonb_build_object('transfer_id', v_id);

  elsif p_kind = 'REPRESENTATION' then
    -- NO_AGENCY_LISTED records what a source displayed on a date. It is not a
    -- claim that the player is unrepresented, and every surface says so.
    update representation_records set is_current = false
     where player_id = p_player and provider_code = p_provider and is_current;
    insert into representation_records (player_id, agency_name, agent_name, status,
                                        provider_code, source_url, retrieved_at, is_current)
    values (p_player,
            nullif(p_data->>'agency_name',''),
            nullif(p_data->>'agent_name',''),
            coalesce(nullif(upper(p_data->>'status'),''), 'UNKNOWN')::representation_status,
            p_provider, p_url, now(), true)
    returning id into v_id;
    return jsonb_build_object('representation_id', v_id);

  elsif p_kind = 'INJURY' then
    insert into player_injuries (player_id, description, injury_type, started_on,
                                 expected_return_on, ended_on, games_missed,
                                 provider_code, retrieved_at)
    values (p_player,
            nullif(p_data->>'description',''),
            nullif(p_data->>'injury_type',''),
            (nullif(p_data->>'started_on',''))::date,
            (nullif(p_data->>'expected_return_on',''))::date,
            (nullif(p_data->>'ended_on',''))::date,
            (nullif(p_data->>'games_missed',''))::int,
            p_provider, now())
    on conflict (player_id, provider_code, started_on) do update
      set description        = coalesce(excluded.description, player_injuries.description),
          injury_type        = coalesce(excluded.injury_type, player_injuries.injury_type),
          expected_return_on = excluded.expected_return_on,
          ended_on           = excluded.ended_on,
          games_missed       = excluded.games_missed,
          retrieved_at       = excluded.retrieved_at
    returning id into v_id;
    return jsonb_build_object('injury_id', v_id);

  elsif p_kind = 'CAREER' then
    insert into player_team_history (player_id, club_id, club_name_raw, start_date, end_date,
                                     is_loan, is_current, shirt_number, source_provider)
    values (p_player, v_club, nullif(p_data->>'club',''),
            (nullif(p_data->>'start_date',''))::date,
            (nullif(p_data->>'end_date',''))::date,
            coalesce((p_data->>'is_loan')::boolean, false),
            coalesce((p_data->>'is_current')::boolean, false),
            (nullif(p_data->>'shirt_number',''))::int,
            p_provider)
    on conflict (player_id, source_provider, club_id, start_date) do update
      set end_date     = excluded.end_date,
          is_loan      = excluded.is_loan,
          is_current   = excluded.is_current,
          shirt_number = coalesce(excluded.shirt_number, player_team_history.shirt_number),
          club_name_raw = coalesce(excluded.club_name_raw, player_team_history.club_name_raw)
    returning id into v_id;
    return jsonb_build_object('career_id', v_id);
  end if;

  return jsonb_build_object('error', 'UNKNOWN_KIND');
end $fn$;

comment on function gbm_intel__record is
  'Writes the provider-keyed record tables on behalf of a registered agent. Every row is tagged with the provider it came from, so nothing overwrites another source.';

revoke all on function gbm_intel__identity(uuid, text, fact_state, jsonb, text) from public, anon, authenticated;
revoke all on function gbm_intel__record(text, uuid, text, jsonb, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
