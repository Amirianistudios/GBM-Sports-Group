-- ============================================================================
-- GBM INTELLIGENCE — 0019 OPPORTUNITY SCORE STOPS SATURATING
-- ----------------------------------------------------------------------------
-- Review finding, 2026-08-22: 237 players shared the top score. The composite
-- summed to at most 120 and was then clamped with least(100, …), so every
-- profile that maxed the coarse factors — young, target league, target
-- citizenship, realistic value, regular minutes, contract window, value
-- growth — landed on exactly 100. The model discriminated in the middle of
-- the distribution (median 62) and went flat precisely where a scout looks.
--
-- Two changes, no new inputs and no new weights:
--
--   · The clamp becomes a rescale. The raw sum keeps its full 0–120 range
--     and maps onto 0–100 (× 100/120), so the ordering at the top survives
--     into the displayed score instead of being flattened into it.
--
--   · League minutes become a continuous gradient — least(9, minutes/300)
--     rather than 0 / 5 / 9 steps. Minutes are the one factor that varies
--     smoothly across otherwise identical profiles, so this breaks ties on
--     the evidence a scout would use anyway: who is actually playing.
--
-- Model version v3; v2 rows are superseded and removed, as v1 was by v2.
-- Every factor still writes itself into the rationale, so the score remains
-- explainable player by player.
-- ============================================================================

create or replace function gbm_compute_discovery_signals()
returns table (signal_type text, inserted int)
language plpgsql
security definer
set search_path = public
set statement_timeout = '300s'
as $$
declare
  model constant text := 'v3';
begin
  delete from discovery_signals where model_version in ('v1', 'v2', model);

  -- --------------------------------------------------------------------
  -- CONTRACT_EXPIRING — inside the final 18 months. (Unchanged from v1.)
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
  -- RAPID_VALUE_GROWTH — >= 50% over ~12 months. (Unchanged from v1.)
  -- --------------------------------------------------------------------
  insert into discovery_signals (player_id, signal_type, score, rationale, evidence, model_version)
  select
    g.player_id,
    'RAPID_VALUE_GROWTH',
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
  -- UNREPRESENTED_HIGH_POTENTIAL — young, valued, no agency listed.
  -- (Unchanged from v1, caveat preserved verbatim.)
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

  -- --------------------------------------------------------------------
  -- GBM_OPPORTUNITY — the composite acquisition-fit score, one row per
  -- player, factors written into the rationale. Weights mirror the import
  -- selection (services/ingestion/src/transfermarkt/select.ts) plus the
  -- facts only the database can see: league minutes and value growth.
  -- --------------------------------------------------------------------
  insert into discovery_signals (player_id, signal_type, score, rationale, evidence, model_version)
  select
    s.player_id,
    'GBM_OPPORTUNITY',
    round((s.age_pts + s.league_pts + s.citizenship_pts + s.value_pts
           + s.minutes_pts + s.contract_pts + s.growth_pts) * 100.0 / 120.0, 3)::numeric(6,3),
    concat_ws(' · ',
      case when s.years is null then 'age unknown (+' || s.age_pts || ')'
           else 'age ' || s.years || ' (+' || s.age_pts || ')' end,
      case when s.league_pts > 0 then 'target league: ' || s.league_name || ' (+' || s.league_pts || ')' end,
      case when s.citizenship_pts > 0 then 'target market: ' || s.citizenship || ' (+' || s.citizenship_pts || ')' end,
      case when s.value_amount is null then 'value unknown (+' || s.value_pts || ')'
           else 'value €' || to_char(s.value_amount, 'FM999,999,999') || ' (+' || s.value_pts || ')' end,
      case when s.minutes_pts > 0 then s.season_minutes || ' league minutes (+' || round(s.minutes_pts, 1) || ')' end,
      case when s.contract_pts > 0 then 'contract to ' || to_char(s.expires_on, 'Mon YYYY') || ' (+' || s.contract_pts || ')' end,
      case when s.growth_pts > 0 then 'value +' || round(s.growth_pct) || '% in 12m (+' || s.growth_pts || ')' end
    ),
    jsonb_build_object(
      'age', s.years, 'age_pts', s.age_pts,
      'league', s.league_name, 'league_pts', s.league_pts,
      'citizenship', s.citizenship, 'citizenship_pts', s.citizenship_pts,
      'market_value', s.value_amount, 'value_pts', s.value_pts,
      'season_minutes', s.season_minutes, 'minutes_pts', s.minutes_pts,
      'contract_expires', s.expires_on, 'contract_pts', s.contract_pts,
      'growth_pct', case when s.growth_pct is not null then round(s.growth_pct, 1) end,
      'growth_pts', s.growth_pts
    ),
    model
  from (
    select
      b.*,
      case when b.years is null then 8
           when b.years < 21 then 40
           when b.years < 24 then 34
           when b.years < 27 then 22
           when b.years < 30 then 10
           when b.years < 33 then 2
           else 0 end as age_pts,
      case when b.league_is_target then 25 else 0 end as league_pts,
      case when b.citizenship_is_target then 20 else 0 end as citizenship_pts,
      case when b.value_amount is null or b.value_amount < 50000 then 6
           when b.value_amount <= 5000000 then 15
           when b.value_amount <= 10000000 then 8
           else 2 end as value_pts,
      least(9.0, coalesce(b.season_minutes, 0) / 300.0)::numeric(6,3) as minutes_pts,
      case when b.expires_on is not null
                and b.expires_on <= current_date + interval '18 months' then 6
           else 0 end as contract_pts,
      case when b.growth_pct >= 50 then 5 else 0 end as growth_pts
    from (
      select
        p.id as player_id,
        case when p.date_of_birth is not null
             then floor(extract(epoch from age(current_date, p.date_of_birth)) / 31557600)::int
        end as years,
        nat.name as citizenship,
        coalesce(natm.citizenship_target, false) as citizenship_is_target,
        tl.league_name,
        coalesce(tl.league_is_target, false) as league_is_target,
        val.value_amount,
        st.season_minutes,
        ct.expires_on,
        case when yr.value_amount > 0
             then (val.value_amount - yr.value_amount) / yr.value_amount * 100
        end as growth_pct
      from players p
      cross join (select max(se.name) as name
                  from seasons se
                  where exists (select 1 from player_season_stats s where s.season_id = se.id)) cs
      left join countries nat on nat.id = p.nationality_country_id
      left join gbm_target_markets natm on natm.country_name = nat.name
      left join lateral (
        select comp.name as league_name,
               coalesce(lm.league_target, false) as league_is_target
        from player_season_stats s
        join seasons se on se.id = s.season_id and se.name = cs.name
        join competitions comp on comp.id = s.competition_id
        left join countries lc on lc.id = comp.country_id
        left join gbm_target_markets lm on lm.country_name = lc.name
        where s.player_id = p.id
        order by s.minutes_played desc nulls last
        limit 1
      ) tl on true
      left join lateral (
        select mv.value_amount from market_values mv
        where mv.player_id = p.id
        order by mv.valued_on desc limit 1
      ) val on true
      left join lateral (
        select mv.value_amount from market_values mv
        where mv.player_id = p.id and mv.valued_on <= current_date - interval '1 year'
        order by mv.valued_on desc limit 1
      ) yr on true
      left join lateral (
        select sum(s.minutes_played)::int as season_minutes
        from player_season_stats s
        join seasons se on se.id = s.season_id
        where s.player_id = p.id and se.name = cs.name
      ) st on true
      left join lateral (
        select co.expires_on from contracts co
        where co.player_id = p.id and co.expires_on > current_date
        order by co.expires_on asc limit 1
      ) ct on true
    ) b
  ) s;

  perform gbm_refresh_player_caches();

  return query
    select ds.signal_type, count(*)::int
    from discovery_signals ds
    where ds.model_version = model
    group by ds.signal_type
    order by ds.signal_type;
end;
$$;

comment on function gbm_compute_discovery_signals is
  'Recomputes the current discovery signal set (model v3: GBM_OPPORTUNITY rescaled 0-100 without a clamp, minutes as a continuous gradient) from stored facts, then refreshes the derived list caches. Idempotent; at most one row per player per signal type.';
