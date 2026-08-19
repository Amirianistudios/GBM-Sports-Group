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
-- Latest market value per player, as a reusable view.
-- ============================================================================
create or replace view player_latest_market_value as
select distinct on (player_id)
  player_id,
  value_amount,
  valued_on,
  provider_code
from market_values
order by player_id, valued_on desc;

comment on view player_latest_market_value is
  'Most recent market valuation per player, whichever provider supplied it.';

-- ============================================================================
-- gbm_compute_discovery_signals()
-- ----------------------------------------------------------------------------
-- Recomputes the full current signal set under model_version 'v1'. Idempotent:
-- the previous v1 generation is removed first, so running it twice produces the
-- same rows rather than duplicates.
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
  -- Scored so that the closest expiry ranks highest.
  -- --------------------------------------------------------------------
  insert into discovery_signals (player_id, signal_type, score, rationale, evidence, model_version)
  select
    c.player_id,
    'CONTRACT_EXPIRING',
    round(greatest(1, 100 - (extract(day from c.expires_on - current_date) / 5.5))::numeric, 3),
    format('Contract expires %s (%s months). %s',
           to_char(c.expires_on, 'DD Mon YYYY'),
           round(extract(day from c.expires_on - current_date) / 30.44),
           coalesce(cl.name, 'club unknown')),
    jsonb_build_object(
      'expires_on', c.expires_on,
      'days_remaining', extract(day from c.expires_on - current_date),
      'provider', c.provider_code
    ),
    model
  from contracts c
  left join clubs cl on cl.id = c.club_id
  where c.expires_on is not null
    and c.expires_on > current_date
    and c.expires_on <= current_date + interval '18 months'
  on conflict do nothing;

  -- --------------------------------------------------------------------
  -- RAPID_VALUE_GROWTH — market value up >= 50% over roughly 12 months.
  -- --------------------------------------------------------------------
  insert into discovery_signals (player_id, signal_type, score, rationale, evidence, model_version)
  select
    g.player_id,
    'RAPID_VALUE_GROWTH',
    round(least(100, g.growth_pct)::numeric, 3),
    format('Market value rose %s%% in 12 months, from %s to %s EUR.',
           round(g.growth_pct), to_char(g.past_value, 'FM999,999,999'), to_char(g.now_value, 'FM999,999,999')),
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
    from player_latest_market_value lv
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
  where g.growth_pct >= 50
  on conflict do nothing;

  -- --------------------------------------------------------------------
  -- UNREPRESENTED_HIGH_POTENTIAL — young, valued, and the source lists no
  -- agency. NO_AGENCY_LISTED is what Transfermarkt displays, not proof the
  -- player is legally unrepresented; the rationale says so explicitly.
  -- --------------------------------------------------------------------
  insert into discovery_signals (player_id, signal_type, score, rationale, evidence, model_version)
  select
    p.id,
    'UNREPRESENTED_HIGH_POTENTIAL',
    round(least(100, (lv.value_amount / 50000.0) + (24 - age.years) * 4)::numeric, 3),
    format('Age %s, valued at %s EUR, and %s lists no agency (checked %s). Requires verification — a blank field is not proof of no representation.',
           age.years, to_char(lv.value_amount, 'FM999,999,999'),
           r.provider_code, to_char(r.retrieved_at, 'DD Mon YYYY')),
    jsonb_build_object(
      'age', age.years, 'market_value', lv.value_amount,
      'representation_status', r.status, 'checked_at', r.retrieved_at
    ),
    model
  from players p
  join representation_records r
    on r.player_id = p.id and r.is_current and r.status = 'NO_AGENCY_LISTED'
  join player_latest_market_value lv on lv.player_id = p.id
  cross join lateral (
    select floor(extract(epoch from age(current_date, p.date_of_birth)) / 31557600)::int as years
  ) age
  where p.date_of_birth is not null
    and age.years between 15 and 23
    and lv.value_amount >= 250000
  on conflict do nothing;

  return query
    select ds.signal_type, count(*)::int
    from discovery_signals ds
    where ds.model_version = model
    group by ds.signal_type
    order by ds.signal_type;
end;
$$;

comment on function gbm_compute_discovery_signals is
  'Recomputes the current discovery signal set from stored facts. Idempotent; replaces the previous v1 generation.';
