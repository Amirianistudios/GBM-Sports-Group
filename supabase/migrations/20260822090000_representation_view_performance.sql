-- ============================================================================
-- GBM INTELLIGENCE — 0015 REPRESENTATION VIEW PERFORMANCE + LEAGUE OPTIONS
-- ----------------------------------------------------------------------------
-- Measured in production on 2026-08-22: v_representation_opportunities took
-- ~1.2 s for a 25-row page (the value-trend subquery materializes per player
-- and rescans all 62k valuations — 47,208 rows discarded by join filter for
-- one page), and with ORDER BY it evaluates fully: the dashboard paid ~9–11 s
-- TTFB and /representation ~8.5 s. Same disease as the discovery view fixed
-- in 0014, same cure: every per-player fact becomes a correlated LATERAL
-- against an existing index, so cost is proportional to rows returned.
-- Columns, order, types and semantics unchanged:
--   · representation = collapsed across current records, disagreement
--                      surfaces as CONFLICTING; checked-at = latest record;
--                      source_url = most recently retrieved
--   · market value   = latest valuation, whichever provider
--   · 12-month change= vs latest valuation dated ≤ 1 year ago,
--                      round((cur − old)/old·100, 1), NULL unless old > 0
--   · contract       = most recently updated row
--   · transfermarkt  = dataset-provider URL preferred, else earliest
-- No table, RLS, grant or data changes. security_invoker as everywhere.
--
-- Also: v_league_options — the discovery filter dropdown was built by
-- evaluating the entire discovery view just to list league names. This tiny
-- view answers it from competitions + a stats existence probe in ~ms.
-- ============================================================================

create or replace view v_representation_opportunities with (security_invoker = on) as
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
  rep.status          as representation_status,
  rep.agency_name     as agency_name,
  rep.last_checked_at as representation_checked_at,
  rep.source_url      as representation_source_url,
  val.value_amount    as market_value,
  case when yr.value_amount > 0
       then round((val.value_amount - yr.value_amount) / yr.value_amount * 100, 1)
  end as value_change_12m_pct,
  ct.expires_on as contract_expires_on,
  case when ct.expires_on is not null
       then round((ct.expires_on - current_date)::numeric / 30.44) end as contract_months_remaining,
  tm.url as transfermarkt_url,
  p.image_url,
  p.gbm_status
from players p
left join clubs c       on c.id = p.current_club_id
left join countries nat on nat.id = p.nationality_country_id
left join lateral (
  select
    (array_agg(rr.agency_name order by (rr.agency_name is null), rr.retrieved_at desc)
       filter (where rr.agency_name is not null))[1] as agency_name,
    case
      when count(*) = 0 then null
      when count(distinct rr.status) > 1 then 'CONFLICTING'
      else (array_agg(rr.status order by rr.retrieved_at desc))[1]::text
    end as status,
    max(rr.retrieved_at) as last_checked_at,
    (array_agg(rr.source_url order by rr.retrieved_at desc))[1] as source_url
  from representation_records rr
  where rr.player_id = p.id and rr.is_current
) rep on true
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
  select co.expires_on
  from contracts co
  where co.player_id = p.id
  order by co.updated_at desc
  limit 1
) ct on true
left join lateral (
  select e.url
  from player_external_ids e
  where e.player_id = p.id
    and e.provider_code in ('TRANSFERMARKT', 'TRANSFERMARKT_DATASET')
  order by case e.provider_code when 'TRANSFERMARKT_DATASET' then 0 else 1 end,
           e.created_at
  limit 1
) tm on true;

comment on view v_representation_opportunities is
  'Representation research queue, one row per player. NO_AGENCY_LISTED records what a source displayed on a date; it is not evidence a player is unrepresented. Computed via per-player lateral index lookups.';

-- ----------------------------------------------------------------------------
-- League filter options — competitions that actually carry season statistics.
-- ----------------------------------------------------------------------------
create or replace view v_league_options with (security_invoker = on) as
select comp.id as league_id, comp.name as league_name
from competitions comp
where exists (select 1 from player_season_stats s where s.competition_id = comp.id);

comment on view v_league_options is
  'Competitions with imported season statistics — the discovery filter dropdown, answered from tables instead of evaluating the whole discovery view.';

grant select on v_league_options to authenticated;
