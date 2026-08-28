-- ============================================================================
-- GBM INTELLIGENCE — 0050 ASK ONCE, AND COUNT IN THE DATABASE
-- ----------------------------------------------------------------------------
-- Three surfaces were counting client-side what the database can answer in
-- one round trip — and two of them were silently wrong, because PostgREST
-- caps an unranged response at 1,000 rows:
--
--   /trends   read the whole players table into JavaScript to compute
--             medians, received at most 1,000 of 13,296 rows, and printed
--             the truncated number as "the N tracked players".
--   /data     read the whole player_external_ids table (85,100 rows) to
--             derive per-provider presence from at most 1,000.
--   /         (dashboard) ran four separate count round-trips, and its
--             alerts stat showed the length of a 3-row preview list — so
--             the number could never exceed three.
--
-- Everything here is SECURITY INVOKER: these are conveniences over data the
-- signed-in member can already read, not privilege escalations, so RLS keeps
-- applying exactly as it does to the underlying tables.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The dashboard's four numbers, one round trip, and the alert count is the
-- real count rather than the preview length.
-- ----------------------------------------------------------------------------
create or replace function gbm_dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $fn$
  select jsonb_build_object(
    'players_total', (select count(*) from players),
    'portfolio_total', (select count(*) from gbm_portfolio),
    'contracts_expiring_6mo', (
      select count(*) from players
       where cached_contract_expires >= current_date
         and cached_contract_expires <= current_date + interval '6 months'),
    'unread_alerts', (select count(*) from alerts where not is_read)
  );
$fn$;

comment on function gbm_dashboard_summary is
  'The dashboard''s stat row in one answer. SECURITY INVOKER: counts only what the caller''s RLS lets them see.';

revoke all on function gbm_dashboard_summary() from public, anon;
grant execute on function gbm_dashboard_summary() to authenticated;

-- ----------------------------------------------------------------------------
-- The trends page, computed where the rows live. Medians via
-- percentile_cont, cohorts identical to the page's previous JavaScript —
-- but over the whole population instead of the first thousand rows.
-- ----------------------------------------------------------------------------
create or replace function gbm_trends_report()
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $fn$
with pop as (
  select
    extract(epoch from (now() - date_of_birth::timestamptz)) / 31557600.0 as age,
    primary_position,
    cached_market_value  as market_value,
    cached_value_change_pct as value_change,
    cached_league        as league_name
  from players
),
valued as (select * from pop where market_value is not null and market_value > 0),
age_banded as (
  select v.*, b.label, b.ord
  from valued v
  join lateral (
    select case
      when v.age >= 16 and v.age < 19 then '16–18'
      when v.age >= 19 and v.age < 22 then '19–21'
      when v.age >= 22 and v.age < 25 then '22–24'
      when v.age >= 25 and v.age < 29 then '25–28'
      when v.age >= 29 and v.age < 33 then '29–32'
      when v.age >= 33 then '33+'
    end as label,
    case
      when v.age >= 16 and v.age < 19 then 1
      when v.age >= 19 and v.age < 22 then 2
      when v.age >= 22 and v.age < 25 then 3
      when v.age >= 25 and v.age < 29 then 4
      when v.age >= 29 and v.age < 33 then 5
      when v.age >= 33 then 6
    end as ord
  ) b on b.label is not null
),
positions as (
  select v.*, g.label, g.ord
  from valued v
  join lateral (
    select case
      when v.primary_position = 'Goalkeeper' then 'Goalkeepers'
      when v.primary_position = 'Centre-Back' then 'Centre-backs'
      when v.primary_position in ('Left-Back', 'Right-Back') then 'Full-backs'
      when v.primary_position = 'Defensive Midfield' then 'Defensive mid'
      when v.primary_position = 'Central Midfield' then 'Central mid'
      when v.primary_position = 'Attacking Midfield' then 'Attacking mid'
      when v.primary_position like '%Winger%'
        or v.primary_position in ('Left Midfield', 'Right Midfield') then 'Wingers'
      when v.primary_position in ('Centre-Forward', 'Second Striker') then 'Strikers'
    end as label,
    case
      when v.primary_position = 'Goalkeeper' then 1
      when v.primary_position = 'Centre-Back' then 2
      when v.primary_position in ('Left-Back', 'Right-Back') then 3
      when v.primary_position = 'Defensive Midfield' then 4
      when v.primary_position = 'Central Midfield' then 5
      when v.primary_position = 'Attacking Midfield' then 6
      when v.primary_position like '%Winger%'
        or v.primary_position in ('Left Midfield', 'Right Midfield') then 7
      when v.primary_position in ('Centre-Forward', 'Second Striker') then 8
    end as ord
  ) g on g.label is not null
)
select jsonb_build_object(
  'population', (select count(*) from pop),
  'valued', (select count(*) from valued),
  'by_age', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'label', label, 'n', n, 'median', median, 'median_change', median_change
      ) order by ord), '[]'::jsonb)
    from (
      select label, min(ord) ord, count(*) n,
             percentile_cont(0.5) within group (order by market_value) as median,
             percentile_cont(0.5) within group (order by value_change)
               filter (where value_change is not null) as median_change
        from age_banded group by label
    ) a),
  'by_position', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'label', label, 'n', n, 'median', median
      ) order by ord), '[]'::jsonb)
    from (
      select label, min(ord) ord, count(*) n,
             percentile_cont(0.5) within group (order by market_value) as median
        from positions group by label
    ) p),
  'by_league', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'label', league_name, 'n', n, 'total', total
      ) order by total desc), '[]'::jsonb)
    from (
      select league_name, count(*) n, sum(market_value) total
        from valued where league_name is not null
       group by league_name order by total desc limit 12
    ) l)
);
$fn$;

comment on function gbm_trends_report is
  'The trends page''s cohort medians, computed over the whole population in SQL. Replaces a client-side aggregation that silently worked on the first 1,000 rows of the players table.';

revoke all on function gbm_trends_report() from public, anon;
grant execute on function gbm_trends_report() to authenticated;

-- ----------------------------------------------------------------------------
-- Which providers actually hold identities, counted where they live.
-- ----------------------------------------------------------------------------
create or replace view v_provider_id_counts
with (security_invoker = on) as
select provider_code,
       count(*)                  as external_ids,
       count(distinct player_id) as players
from player_external_ids
group by provider_code;

comment on view v_provider_id_counts is
  'Per-provider identity coverage. Replaces an application-side scan of the whole player_external_ids table that the response row cap silently truncated.';

grant select on v_provider_id_counts to authenticated;

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
do $$
declare v jsonb; v_missing text; v_pop bigint; v_ids bigint;
begin
  v := gbm_dashboard_summary();
  select string_agg(k, ', ') into v_missing from unnest(array[
    'players_total', 'portfolio_total', 'contracts_expiring_6mo', 'unread_alerts'
  ]) k where not v ? k;
  if v_missing is not null then
    raise exception 'gbm_dashboard_summary is missing keys: %', v_missing;
  end if;

  v := gbm_trends_report();
  select string_agg(k, ', ') into v_missing from unnest(array[
    'population', 'valued', 'by_age', 'by_position', 'by_league'
  ]) k where not v ? k;
  if v_missing is not null then
    raise exception 'gbm_trends_report is missing keys: %', v_missing;
  end if;

  -- The whole point: the report must describe the population, not a page.
  v_pop := (v ->> 'population')::bigint;
  if v_pop <> (select count(*) from players) then
    raise exception 'gbm_trends_report population % does not match players count', v_pop;
  end if;

  select coalesce(sum(external_ids), 0) into v_ids from v_provider_id_counts;
  if v_ids <> (select count(*) from player_external_ids) then
    raise exception 'v_provider_id_counts loses rows: % vs %',
      v_ids, (select count(*) from player_external_ids);
  end if;
end $$;
