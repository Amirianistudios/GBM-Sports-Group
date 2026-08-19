-- ============================================================================
-- GBM INTELLIGENCE — 0007 REPRODUCIBLE DISCOVERY SIGNALS
-- ----------------------------------------------------------------------------
-- The first 31 discovery_signals rows were inserted by hand during the initial
-- build to prove the page rendered. They are sample records, not intelligence,
-- and are retired here rather than deleted so the provenance stays auditable.
--
-- Everything below is computed from data GBM actually holds, set-based, and
-- every signal carries the rationale that produced it. A signal GBM cannot
-- explain is a signal GBM cannot act on.
--
-- Note on date arithmetic: in Postgres `date - date` yields an integer number
-- of days, not an interval, so `extract(day from …)` over it raises. Day counts
-- below are therefore plain integer subtraction.
-- ============================================================================

-- Retire the hand-seeded sample set, recording why.
update discovery_signals
set is_current = false,
    evidence = evidence || jsonb_build_object(
      'provenance', 'manually seeded during initial build',
      'retired_by', 'migration 20260819130100',
      'note', 'sample data, never computed from source facts'
    )
where model_version = 'v0';

-- ============================================================================
-- gbm_compute_discovery_signals()
-- ----------------------------------------------------------------------------
-- Recomputes the full current signal set under model_version 'v1'. Idempotent:
-- the previous v1 generation is removed first, so running it twice produces the
-- same rows rather than duplicates.
--
-- Every branch emits at most one row per player per signal type. That is not
-- cosmetic: a player with two contract rows, or listed as unrepresented by two
-- providers, would otherwise appear two or three times in a single Discover
-- list and read as several different prospects.
-- ============================================================================
create or replace function gbm_compute_discovery_signals()
returns table (signal_type text, inserted int)
language plpgsql
security definer
set search_path = public
as $$
declare
  model constant text := 'v1';
begin
  delete from discovery_signals where model_version = model;

  -- --------------------------------------------------------------------
  -- CONTRACT_EXPIRING — inside the final 18 months.
  -- Where a player has several contract rows the soonest expiry wins, since
  -- that is the one that creates the opportunity.
  -- --------------------------------------------------------------------
  insert into discovery_signals (player_id, signal_type, score, rationale, evidence, model_version)
  select
    x.player_id,
    'CONTRACT_EXPIRING',
    round(greatest(1, 100 - (x.days_remaining / 5.5))::numeric, 3),
    format('Contract expires %s (%s months). %s',
           to_char(x.expires_on, 'DD Mon YYYY'),
           round(x.days_remaining / 30.44),
           coalesce(x.club_name, 'club unknown')),
    jsonb_build_object(
      'expires_on', x.expires_on,
      'days_remaining', x.days_remaining,
      'provider', x.provider_code
    ),
    model
  from (
    select distinct on (c.player_id)
      c.player_id,
      c.expires_on,
      (c.expires_on - current_date)::numeric as days_remaining,
      c.provider_code,
      cl.name as club_name
    from contracts c
    left join clubs cl on cl.id = c.club_id
    where c.expires_on is not null
      and c.expires_on > current_date
      and c.expires_on <= current_date + interval '18 months'
    order by c.player_id, c.expires_on
  ) x;

  -- --------------------------------------------------------------------
  -- RAPID_VALUE_GROWTH — market value up >= 50% over roughly 12 months.
  -- One row per player by construction: the latest valuation is unique and
  -- the lateral picks a single prior point.
  -- --------------------------------------------------------------------
  insert into discovery_signals (player_id, signal_type, score, rationale, evidence, model_version)
  select
    g.player_id,
    'RAPID_VALUE_GROWTH',
    -- Logarithmic, not linear: a linear cap at 100 made 100% growth and
    -- 1400% growth score identically, which flattens exactly the ranking the
    -- Discover page sorts on. This maps 50% -> 50 and ~1600% -> 100 while
    -- keeping every step in between distinguishable.
    round(least(100, 50 + 10 * log(2.0, (g.growth_pct / 50.0)))::numeric, 3),
    format('Market value rose %s%% in 12 months, from %s to %s EUR.',
           round(g.growth_pct),
           to_char(g.past_value, 'FM999,999,999'),
           to_char(g.now_value, 'FM999,999,999')),
    jsonb_build_object(
      'previous_value', g.past_value, 'current_value', g.now_value,
      'previous_date', g.past_date, 'current_date', g.now_date,
      'growth_pct', round(g.growth_pct, 1)
    ),
    model
  from (
    select
      lv.player_id,
      lv.value_amount as now_value,
      lv.valued_on    as now_date,
      pv.value_amount as past_value,
      pv.valued_on    as past_date,
      ((lv.value_amount - pv.value_amount) / nullif(pv.value_amount, 0)) * 100 as growth_pct
    from v_player_current_value lv
    join lateral (
      select value_amount, valued_on
      from market_values m
      where m.player_id = lv.player_id
        and m.valued_on <= lv.valued_on - interval '10 months'
      order by m.valued_on desc
      limit 1
    ) pv on true
    where lv.value_amount > 0 and pv.value_amount > 0
  ) g
  where g.growth_pct >= 50;

  -- --------------------------------------------------------------------
  -- UNREPRESENTED_HIGH_POTENTIAL — young, valued, and the source lists no
  -- agency. NO_AGENCY_LISTED is what a provider displayed on a date, not
  -- proof the player is unrepresented; the rationale says so explicitly.
  --
  -- Deduplicated per player: two providers both showing no agency is one
  -- prospect, not two. The most recently checked provider is cited.
  -- --------------------------------------------------------------------
  insert into discovery_signals (player_id, signal_type, score, rationale, evidence, model_version)
  select
    x.player_id,
    'UNREPRESENTED_HIGH_POTENTIAL',
    round(least(100, (x.value_amount / 50000.0) + (24 - x.years) * 4)::numeric, 3),
    format('Age %s, valued at %s EUR, and %s lists no agency (checked %s). Requires verification — a blank field is not proof of no representation.',
           x.years,
           to_char(x.value_amount, 'FM999,999,999'),
           x.provider_code,
           to_char(x.retrieved_at, 'DD Mon YYYY')),
    jsonb_build_object(
      'age', x.years, 'market_value', x.value_amount,
      'representation_status', x.status, 'checked_at', x.retrieved_at
    ),
    model
  from (
    select distinct on (p.id)
      p.id as player_id,
      floor(extract(epoch from age(current_date, p.date_of_birth)) / 31557600)::int as years,
      lv.value_amount,
      r.provider_code,
      r.retrieved_at,
      r.status
    from players p
    join representation_records r
      on r.player_id = p.id and r.is_current and r.status = 'NO_AGENCY_LISTED'
    join v_player_current_value lv on lv.player_id = p.id
    where p.date_of_birth is not null
      and lv.value_amount >= 250000
      and floor(extract(epoch from age(current_date, p.date_of_birth)) / 31557600)::int between 15 and 23
    order by p.id, r.retrieved_at desc
  ) x;

  return query
    select ds.signal_type, count(*)::int
    from discovery_signals ds
    where ds.model_version = model
    group by ds.signal_type
    order by ds.signal_type;
end;
$$;

comment on function gbm_compute_discovery_signals is
  'Recomputes the current discovery signal set from stored facts. Idempotent; at most one row per player per signal type.';
