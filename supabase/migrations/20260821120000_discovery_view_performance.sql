-- ============================================================================
-- GBM INTELLIGENCE — 0014 DISCOVERY VIEW PERFORMANCE
-- ----------------------------------------------------------------------------
-- Found in production on 2026-08-21: the comparison page failed silently and
-- the discovery list ran at ~7.6 s because v_player_discovery was built on a
-- four-view chain (v_representation_opportunities → current value / value
-- trend / representation) whose CTEs and window scans evaluate the WHOLE
-- market_values (62k rows) and stats tables regardless of any player filter.
-- A point lookup (`player_id in (…)`) with the full column list exceeded the
-- authenticated 8-second statement timeout: SQL state 57014.
--
-- The rewrite computes every per-player fact through a correlated LATERAL
-- against an existing index (market_values(player_id, valued_on desc),
-- player_season_stats(player_id), contracts(player_id),
-- representation_records(player_id) where is_current,
-- discovery_signals(player_id)), so the cost of a query is proportional to
-- the players it actually returns. Columns, order, types and semantics are
-- unchanged:
--   · market value        = latest valuation, whichever provider
--   · 12-month change     = vs latest valuation dated ≤ 1 year ago,
--                           round((cur − old)/old·100, 1), NULL unless old > 0
--   · representation      = collapsed across current records; providers
--                           disagreeing surfaces as CONFLICTING, never one
--                           silently winning
--   · contract            = most recently updated row
--   · season facts        = current season (max season name having stats),
--                           per-90s NULL under 270 minutes
--   · league              = competition with most minutes this season
--   · top signal          = highest-scoring current signal
-- No table, RLS, grant or data changes. security_invoker as everywhere.
-- ============================================================================

create or replace view v_player_discovery with (security_invoker = on) as
with current_season as materialized (
  select max(se.name) as name
  from seasons se
  where exists (select 1 from player_season_stats s where s.season_id = se.id)
)
select
  p.id as player_id,
  p.full_name,
  p.date_of_birth,
  round(extract(epoch from age(current_date, p.date_of_birth)) / 31557600.0, 1) as age,
  p.primary_position,
  p.foot,
  p.height_cm,
  nat.name as nationality,
  c.name   as club_name,
  rep.status      as representation_status,
  rep.agency_name as agency_name,
  val.value_amount as market_value,
  case when yr.value_amount > 0
       then round((val.value_amount - yr.value_amount) / yr.value_amount * 100, 1)
  end as value_change_12m_pct,
  ct.expires_on as contract_expires_on,
  case when ct.expires_on is not null
       then round((ct.expires_on - current_date)::numeric / 30.44) end as contract_months_remaining,
  p.image_url,
  p.gbm_status,
  p.nationality_country_id,
  p.current_club_id,
  cs.name as season_name,
  st.season_apps,
  st.season_minutes,
  st.season_goals,
  st.season_assists,
  case when st.season_minutes >= 270
       then round(st.season_goals   * 90.0 / st.season_minutes, 2) end as goals_per90,
  case when st.season_minutes >= 270
       then round(st.season_assists * 90.0 / st.season_minutes, 2) end as assists_per90,
  tl.league_id,
  tl.league_name,
  sig.signal_type as top_signal_type,
  sig.score       as top_signal_score,
  p.created_at    as added_at
from players p
cross join current_season cs
left join clubs c      on c.id = p.current_club_id
left join countries nat on nat.id = p.nationality_country_id
left join lateral (
  select mv.value_amount
  from market_values mv
  where mv.player_id = p.id
  order by mv.valued_on desc
  limit 1
) val on true
left join lateral (
  select mv.value_amount
  from market_values mv
  where mv.player_id = p.id
    and mv.valued_on <= current_date - interval '1 year'
  order by mv.valued_on desc
  limit 1
) yr on true
left join lateral (
  select
    (array_agg(rr.agency_name order by (rr.agency_name is null), rr.retrieved_at desc)
       filter (where rr.agency_name is not null))[1] as agency_name,
    case
      when count(*) = 0 then null
      when count(distinct rr.status) > 1 then 'CONFLICTING'
      else (array_agg(rr.status order by rr.retrieved_at desc))[1]::text
    end as status
  from representation_records rr
  where rr.player_id = p.id and rr.is_current
) rep on true
left join lateral (
  select co.expires_on
  from contracts co
  where co.player_id = p.id
  order by co.updated_at desc
  limit 1
) ct on true
left join lateral (
  select
    sum(s.matches_played) as season_apps,
    sum(s.minutes_played) as season_minutes,
    sum(s.goals)          as season_goals,
    sum(s.assists)        as season_assists
  from player_season_stats s
  join seasons se on se.id = s.season_id
  where s.player_id = p.id and se.name = cs.name
) st on true
left join lateral (
  select comp.id as league_id, comp.name as league_name
  from player_season_stats s
  join seasons se on se.id = s.season_id and se.name = cs.name
  join competitions comp on comp.id = s.competition_id
  where s.player_id = p.id
  order by s.minutes_played desc nulls last
  limit 1
) tl on true
left join lateral (
  select ds.signal_type, ds.score
  from discovery_signals ds
  where ds.player_id = p.id and ds.is_current
  order by ds.score desc
  limit 1
) sig on true;

comment on view v_player_discovery is
  'Discovery surface: one row per player with current-season counting statistics, per-90 rates (NULL under 270 minutes), primary league, value, representation and strongest current signal. Advanced metrics are absent until a licensed provider supplies them. Computed via per-player lateral index lookups so point queries and the list stay far inside the statement timeout.';
