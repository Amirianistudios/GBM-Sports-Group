-- ============================================================================
-- GBM INTELLIGENCE — 0036 RECRUITMENT MATCHING ENGINE
-- ----------------------------------------------------------------------------
-- A club states what it needs; the platform ranks who fits. Two tables and one
-- function, and the whole design turns on a single decision:
--
--   A MISSING INPUT PRODUCES NULL, NEVER ZERO.
--
-- This is not fastidiousness. 7,848 players are tracked and most of them are
-- thinly covered: no contract, no valuation, no statistics. If an absent market
-- value scored 0 for "financial fit", every unknown player would rank as a
-- confident bad fit, and the ranking would quietly become a map of what the
-- database happens to know rather than of who suits the club. Scoring null and
-- reporting coverage separately is the difference between "he does not fit"
-- and "we cannot say" — and a recruitment tool that cannot tell those apart is
-- worse than no tool.
--
-- So `overall_score` is the weighted mean of the components that exist, and
-- `confidence_level` is the share of the intended weight that was actually
-- available. A player scoring 88 at 0.35 confidence and one scoring 88 at 0.9
-- are different recommendations, and the interface shows both numbers.
--
-- THREE KINDS OF KNOWLEDGE, KEPT APART
--
--   verified   — statistical, financial, market and risk scores, computed here
--                from stored provider data. Reproducible: same data, same
--                number, no model involved.
--   AI         — technical and adaptation scores, written only by the external
--                research team through the intel contract. NULL until then.
--   assumption — anything the requirement itself asserts (budget, urgency).
--                Recorded on the requirement, never mixed into a player score.
--
-- `computed_explanation` is generated from the verified components and always
-- present. `ai_explanation` is the research team's prose and is nullable. The
-- interface labels them differently because they are not the same claim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. What the club is asking for
-- ----------------------------------------------------------------------------
create table if not exists club_requirements (
  id                  uuid primary key default gen_random_uuid(),
  club_id             uuid references clubs(id) on delete set null,
  -- A requirement can precede the club existing in our register, so the name
  -- is kept raw alongside the link rather than blocking on resolution.
  club_name_raw       text,
  title               text,
  position_required   text not null,
  tactical_role       text,
  age_min             int,
  age_max             int,
  transfer_budget_min numeric,
  transfer_budget_max numeric,
  salary_budget_max   numeric,
  currency            text not null default 'EUR',
  contract_preference text check (contract_preference is null or contract_preference in
                        ('ANY','FREE_AGENT','EXPIRING_12M','EXPIRING_6M','UNDER_CONTRACT')),
  preferred_markets   text[] not null default '{}',
  league_level        text,
  urgency             text check (urgency is null or urgency in
                        ('IMMEDIATE','THIS_WINDOW','NEXT_WINDOW','MONITORING')),
  status              text not null default 'OPEN'
                        check (status in ('OPEN','FILLED','WITHDRAWN')),
  notes               text,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (age_min is null or age_max is null or age_max >= age_min),
  check (transfer_budget_min is null or transfer_budget_max is null
         or transfer_budget_max >= transfer_budget_min)
);

comment on table club_requirements is
  'A club brief: position, age band, budget, market preference. Everything here is what the club asserts, never a measurement of a player.';

create index if not exists club_requirements_open_idx
  on club_requirements (status, created_at desc);

-- ----------------------------------------------------------------------------
-- B. How well one player fits one requirement
-- ----------------------------------------------------------------------------
create table if not exists player_fit_scores (
  id                   uuid primary key default gen_random_uuid(),
  player_id            uuid not null references players(id) on delete cascade,
  requirement_id       uuid not null references club_requirements(id) on delete cascade,

  /* Computed from stored provider data. NULL means the inputs were absent. */
  statistical_score    numeric check (statistical_score is null or statistical_score between 0 and 100),
  financial_score      numeric check (financial_score   is null or financial_score   between 0 and 100),
  market_score         numeric check (market_score      is null or market_score      between 0 and 100),
  risk_score           numeric check (risk_score        is null or risk_score        between 0 and 100),

  /* Written only by the research team. NULL until it has an opinion. */
  technical_score      numeric check (technical_score   is null or technical_score   between 0 and 100),
  adaptation_score     numeric check (adaptation_score  is null or adaptation_score  between 0 and 100),

  /* Derived, not stored by hand. Generated columns mean the rollup cannot
     drift from its parts: when the research team later fills technical_score,
     the overall and the confidence move with it in the same statement. An
     earlier draft recomputed these only in the engine, which would have left
     every AI contribution invisible in the ranking forever. */
  overall_score numeric generated always as (
    round((coalesce(statistical_score,0)*30 + coalesce(financial_score,0)*30
         + coalesce(market_score,0)*20     + coalesce(risk_score,0)*20
         + coalesce(technical_score,0)*40  + coalesce(adaptation_score,0)*20)
        / nullif(case when statistical_score is null then 0 else 30 end
               + case when financial_score   is null then 0 else 30 end
               + case when market_score      is null then 0 else 20 end
               + case when risk_score        is null then 0 else 20 end
               + case when technical_score   is null then 0 else 40 end
               + case when adaptation_score  is null then 0 else 20 end, 0), 1)
  ) stored,

  /* Share of the full 160 points of possible weight that had data behind it.
     A complete computed profile with no AI opinion reaches 0.63, which is the
     honest ceiling for a player nobody has watched. */
  confidence_level numeric generated always as (
    round((case when statistical_score is null then 0 else 30 end
         + case when financial_score   is null then 0 else 30 end
         + case when market_score      is null then 0 else 20 end
         + case when risk_score        is null then 0 else 20 end
         + case when technical_score   is null then 0 else 40 end
         + case when adaptation_score  is null then 0 else 20 end)::numeric / 160.0, 2)
  ) stored,

  /* Named gaps, so the interface can say what is unknown rather than leaving
     the reader to infer it from a low confidence number. */
  missing_components text[] generated always as (
    array_remove(array[
      case when statistical_score is null then 'statistical' end,
      case when financial_score   is null then 'financial'   end,
      case when market_score      is null then 'market'      end,
      case when risk_score        is null then 'risk'        end,
      case when technical_score   is null then 'technical'   end,
      case when adaptation_score  is null then 'adaptation'  end
    ], null)
  ) stored,

  computed_explanation text,
  ai_explanation       text,
  ai_agent_id          uuid references intel_agents(id) on delete set null,

  computed_at          timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  unique (player_id, requirement_id)
);

comment on table player_fit_scores is
  'One row per player per requirement. Computed components are reproducible from stored data; technical and adaptation come from the research team and stay NULL until it submits. confidence_level reports coverage, not certainty about football.';

comment on column player_fit_scores.risk_score is
  'Higher is safer, consistent with every other component. Reflects how well the platform knows this player and how settled his situation is — not how good he is.';

create index if not exists player_fit_scores_requirement_idx
  on player_fit_scores (requirement_id, overall_score desc nulls last);

-- ----------------------------------------------------------------------------
-- C. Row-level security — the same rules as the rest of the workspace
-- ----------------------------------------------------------------------------
alter table club_requirements enable row level security;
alter table player_fit_scores enable row level security;

-- A new table in `public` inherits a default SELECT grant to `anon`. Row-level
-- security would still refuse every row, but this project has already been
-- bitten once by exactly that grant — the five v_* views in 0007 — so the
-- grant is removed rather than relied upon to be harmless. The guard at the
-- foot of this file fails the migration if it ever comes back, and it caught
-- this on the first attempt to apply.
revoke all on club_requirements from anon;
revoke all on player_fit_scores from anon;

drop policy if exists club_requirements_read on club_requirements;
create policy club_requirements_read on club_requirements
  for select to authenticated using ((select gbm_is_member()));

drop policy if exists club_requirements_insert on club_requirements;
create policy club_requirements_insert on club_requirements
  for insert to authenticated with check ((select gbm_can_write()));
drop policy if exists club_requirements_update on club_requirements;
create policy club_requirements_update on club_requirements
  for update to authenticated using ((select gbm_can_write())) with check ((select gbm_can_write()));
drop policy if exists club_requirements_delete on club_requirements;
create policy club_requirements_delete on club_requirements
  for delete to authenticated using ((select gbm_can_write()));

drop policy if exists player_fit_scores_read on player_fit_scores;
create policy player_fit_scores_read on player_fit_scores
  for select to authenticated using ((select gbm_is_member()));

-- Scores are written by the engine (security definer) and by the research
-- team through the intel contract. Nobody types one in by hand.
drop policy if exists player_fit_scores_insert on player_fit_scores;
create policy player_fit_scores_insert on player_fit_scores
  for insert to authenticated with check ((select gbm_can_write()));
drop policy if exists player_fit_scores_update on player_fit_scores;
create policy player_fit_scores_update on player_fit_scores
  for update to authenticated using ((select gbm_can_write())) with check ((select gbm_can_write()));
drop policy if exists player_fit_scores_delete on player_fit_scores;
create policy player_fit_scores_delete on player_fit_scores
  for delete to authenticated using ((select gbm_can_write()));

-- ----------------------------------------------------------------------------
-- D. Position vocabulary
-- ----------------------------------------------------------------------------
-- The stored vocabulary has drifted: 'Left-Back' and 'Left fullback' both
-- occur, 'Defender' is a generic, and 'Missing' is a literal placeholder that
-- means the position is unknown. Matching on equality alone would silently
-- exclude real candidates, so a requirement's position expands to the family
-- of stored strings that mean the same thing.
--
-- 'Missing' is deliberately never matched: an unknown position is not evidence
-- of fit, and a striker search should not return players who might be anything.
-- ----------------------------------------------------------------------------
create or replace function gbm_position_family(p_position text)
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select case upper(coalesce(p_position, ''))
    when 'GK'  then array['Goalkeeper']
    when 'GOALKEEPER' then array['Goalkeeper']
    when 'CB'  then array['Centre-Back','Defender']
    when 'CENTRE-BACK' then array['Centre-Back','Defender']
    when 'LB'  then array['Left-Back','Left fullback','Defender']
    when 'LEFT-BACK' then array['Left-Back','Left fullback','Defender']
    when 'RB'  then array['Right-Back','Defender']
    when 'RIGHT-BACK' then array['Right-Back','Defender']
    when 'DM'  then array['Defensive Midfield']
    when 'CM'  then array['Central Midfield','Defensive Midfield','Attacking Midfield']
    when 'AM'  then array['Attacking Midfield','Second Striker']
    when 'LW'  then array['Left Winger','Left Midfield']
    when 'RW'  then array['Right Winger','Right Midfield']
    when 'ST'  then array['Centre-Forward','Second Striker']
    when 'CF'  then array['Centre-Forward','Second Striker']
    else array[p_position]
  end;
$$;

comment on function gbm_position_family is
  'Expands a requirement position code to the stored primary_position strings that satisfy it. Never includes the literal placeholder Missing.';

-- ----------------------------------------------------------------------------
-- E. The engine
-- ----------------------------------------------------------------------------
-- Candidates are narrowed on the hard criteria first — position family, age
-- band, and a budget ceiling with headroom — then scored. Narrowing keeps this
-- fast at 7,848 players and, more importantly, keeps the result list honest:
-- a player outside the stated age band is not a weak fit, he is not a
-- candidate, and padding the ranking with him helps nobody.
--
-- A player whose age or value is UNKNOWN is NOT excluded by the filters. He
-- cannot be ruled out on a fact we do not have, so he stays in the list and
-- carries the lower confidence that his gaps earn him.
-- ----------------------------------------------------------------------------
create or replace function gbm_compute_fit_scores(p_requirement uuid)
returns table (scored int, with_full_data int)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  r club_requirements%rowtype;
  v_positions text[];
  v_scored int := 0;
  v_full   int := 0;
begin
  select * into r from club_requirements where id = p_requirement;
  if not found then
    raise exception 'UNKNOWN_REQUIREMENT %', p_requirement using errcode = '22023';
  end if;

  v_positions := gbm_position_family(r.position_required);

  with candidate as (
    select p.id,
           p.cached_market_value as value,
           p.cached_season_minutes as minutes,
           p.cached_contract_expires as expires,
           p.data_confidence,
           round(extract(epoch from age(current_date, p.date_of_birth)) / 31557600.0, 1) as age,
           co.name as nationality,
           p.cached_league as league
      from players p
      left join countries co on co.id = p.nationality_country_id
     where p.primary_position = any (v_positions)
       and coalesce(p.is_retired, false) = false
       -- Unknown age cannot disqualify: only a known age outside the band does.
       and (r.age_min is null or p.date_of_birth is null
            or extract(epoch from age(current_date, p.date_of_birth)) / 31557600.0 >= r.age_min)
       and (r.age_max is null or p.date_of_birth is null
            or extract(epoch from age(current_date, p.date_of_birth)) / 31557600.0 <= r.age_max)
       -- 50% headroom above the ceiling: a club that says €500k will still
       -- look at €700k, and excluding those outright hides real options.
       and (r.transfer_budget_max is null or p.cached_market_value is null
            or p.cached_market_value <= r.transfer_budget_max * 1.5)
  ),
  scored as (
    select
      c.id,
      /* STATISTICAL — availability first, then output. Minutes are the honest
         core: a player who does not play cannot be assessed on production. */
      case when c.minutes is null then null else
        least(100, round(
          (least(c.minutes, 2700) / 2700.0) * 100
        , 1)) end as statistical_score,

      /* FINANCIAL — inside the ceiling is a full score; above it decays to
         zero at twice the ceiling. Below the floor is not penalised, because
         a cheaper player than budgeted is not a worse fit. */
      case
        when c.value is null or r.transfer_budget_max is null then null
        when c.value <= r.transfer_budget_max then 100
        else greatest(0, round(100 - ((c.value - r.transfer_budget_max)
                                      / nullif(r.transfer_budget_max, 0)) * 100, 1))
      end as financial_score,

      /* MARKET — the club's stated preference first, then GBM's own standing
         target markets. Unknown nationality scores null, not zero. */
      case
        when c.nationality is null then null
        when cardinality(r.preferred_markets) > 0
             and c.nationality = any (r.preferred_markets) then 100
        when cardinality(r.preferred_markets) > 0 then 25
        when exists (select 1 from gbm_target_markets m
                      where m.country_name = c.nationality and m.citizenship_target) then 100
        else 50
      end as market_score,

      /* RISK — how well we know him and how settled he is. Deliberately not a
         judgement of the player: a 60 here means thin records, not poor
         quality, and the explanation says so. */
      round(
        (coalesce(c.data_confidence, 0.5) * 60)
        + case when c.expires is null then 0
               when c.expires <= current_date + interval '12 months' then 40
               else 25 end
      , 1) as risk_score,

      c.age, c.value, c.minutes, c.expires, c.nationality, c.league
    from candidate c
  )
  insert into player_fit_scores as t (
    player_id, requirement_id, statistical_score, financial_score, market_score,
    risk_score, computed_explanation, computed_at
  )
  select
    s.id, p_requirement,
    s.statistical_score, s.financial_score, s.market_score, s.risk_score,
    concat_ws('. ',
      case when s.age is not null then 'Age ' || s.age else 'Age unknown' end,
      case when s.value is not null then 'Valued ' || round(s.value)::text || ' ' || r.currency
           else 'No valuation on record' end,
      case when s.minutes is not null then s.minutes::text || ' minutes last season'
           else 'No minutes recorded' end,
      case when s.expires is not null then 'Contract to ' || s.expires::text
           else 'Contract unknown' end,
      case when s.nationality is not null then s.nationality else 'Nationality unknown' end
    ) || '.',
    now()
  from scored s
  on conflict (player_id, requirement_id) do update
    set statistical_score = excluded.statistical_score,
        financial_score   = excluded.financial_score,
        market_score      = excluded.market_score,
        risk_score        = excluded.risk_score,
        computed_explanation = excluded.computed_explanation,
        computed_at       = excluded.computed_at;

  get diagnostics v_scored = row_count;

  -- 0.63 is a fully-computed profile: every verified component present, no
  -- AI opinion yet. Counting against 1.0 would report zero forever.
  select count(*) into v_full from player_fit_scores
   where requirement_id = p_requirement and confidence_level >= 0.62;

  return query select v_scored, v_full;
end $fn$;

comment on function gbm_compute_fit_scores is
  'Ranks candidates against one requirement from stored data only. Absent inputs score NULL and lower confidence_level; they never score zero.';

revoke all on function gbm_compute_fit_scores(uuid) from public, anon;
grant execute on function gbm_compute_fit_scores(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('anon', 'club_requirements', 'select')
     or has_table_privilege('anon', 'player_fit_scores', 'select') then
    raise exception 'recruitment tables are readable by anon';
  end if;

  if 'Missing' = any (gbm_position_family('ST'))
     or 'Missing' = any (gbm_position_family('CB')) then
    raise exception 'the position placeholder Missing is being treated as a real position';
  end if;
end $$;
