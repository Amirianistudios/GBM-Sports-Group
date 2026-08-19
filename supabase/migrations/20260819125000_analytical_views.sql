-- ============================================================================
-- GBM INTELLIGENCE — 0005 ANALYTICAL VIEWS
-- ----------------------------------------------------------------------------
-- These five views were created directly against the hosted database during
-- the initial build and never captured in a migration. The dashboard, the
-- player profile and the representation screen all read from them, so a
-- database rebuilt from migrations alone would have started returning 500s.
--
-- Recording them here closes that drift. Timestamped before the 1300xx
-- migrations because the live database already contains them.
--
-- Each view is created with security_invoker so it enforces the QUERYING
-- user's row-level security rather than the owner's. Without it these views
-- are an unauthenticated read path around RLS — see migration 20260819130200,
-- which closed exactly that hole on the hosted database.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Current market value: the most recent valuation per player.
-- ----------------------------------------------------------------------------
create or replace view v_player_current_value with (security_invoker = on) as
select distinct on (player_id)
  player_id,
  value_amount,
  currency,
  valued_on,
  provider_code
from market_values
order by player_id, valued_on desc;

comment on view v_player_current_value is
  'Latest market valuation per player, whichever provider supplied it.';

-- ----------------------------------------------------------------------------
-- Representation, collapsed across providers.
--
-- When providers disagree the status becomes CONFLICTING rather than one
-- silently winning — GBM must see the disagreement, because an approach based
-- on the wrong agency record is worse than no approach at all.
-- ----------------------------------------------------------------------------
create or replace view v_player_representation with (security_invoker = on) as
select
  player_id,
  (array_agg(agency_name order by (agency_name is null), retrieved_at desc)
     filter (where agency_name is not null))[1] as agency_name,
  (array_agg(provider_code order by retrieved_at desc))[1] as primary_provider,
  case
    when count(distinct status) > 1 then 'CONFLICTING'
    else (array_agg(status order by retrieved_at desc))[1]::text
  end as status,
  count(*)              as source_count,
  max(retrieved_at)     as last_checked_at,
  (array_agg(source_url order by retrieved_at desc))[1] as source_url
from representation_records
where is_current
group by player_id;

comment on view v_player_representation is
  'Current representation per player across providers. Disagreement surfaces as CONFLICTING.';

-- ----------------------------------------------------------------------------
-- Which providers identify a player — the honest basis for "source coverage"
-- on the profile. A provider absent here is shown as not available, never as
-- connected.
-- ----------------------------------------------------------------------------
create or replace view v_player_source_coverage with (security_invoker = on) as
select
  p.id as player_id,
  count(distinct e.provider_code) as provider_count,
  array_agg(distinct e.provider_code) as providers,
  bool_or(e.provider_code = 'WYSCOUT')                                as has_wyscout,
  bool_or(e.provider_code in ('TRANSFERMARKT', 'TRANSFERMARKT_DATASET')) as has_transfermarkt,
  bool_or(e.provider_code = 'REEP')                                   as has_reep,
  bool_or(e.provider_code = 'SOFASCORE')                              as has_sofascore,
  bool_or(e.provider_code = 'FOTMOB')                                 as has_fotmob
from players p
left join player_external_ids e on e.player_id = p.id
group by p.id;

comment on view v_player_source_coverage is
  'Per-player provider coverage. Drives the source-coverage panel on the player profile.';

-- ----------------------------------------------------------------------------
-- Market value trend: current vs peak vs twelve months ago.
-- ----------------------------------------------------------------------------
create or replace view v_player_value_trend with (security_invoker = on) as
with agg as (
  select
    player_id,
    max(value_amount) as peak_value,
    min(valued_on)    as first_valued_on,
    max(valued_on)    as last_valued_on,
    count(*)          as data_points
  from market_values
  group by player_id
),
latest as (
  select player_id, value_amount, currency, valued_on, provider_code
  from v_player_current_value
),
year_ago as (
  select distinct on (player_id) player_id, value_amount
  from market_values
  where valued_on <= current_date - interval '1 year'
  order by player_id, valued_on desc
)
select
  a.player_id,
  l.value_amount as current_value,
  a.peak_value,
  y.value_amount as value_12m_ago,
  case when y.value_amount > 0
       then round((l.value_amount - y.value_amount) / y.value_amount * 100, 1) end as change_12m_pct,
  case when a.peak_value > 0
       then round(l.value_amount / a.peak_value * 100, 1) end as pct_of_peak,
  a.data_points,
  a.first_valued_on,
  a.last_valued_on
from agg a
join latest l on l.player_id = a.player_id
left join year_ago y on y.player_id = a.player_id;

comment on view v_player_value_trend is
  'Market value trajectory per player: current, peak, 12-month change, percent of peak.';

-- ----------------------------------------------------------------------------
-- The representation research queue.
--
-- Deliberately named "opportunities" and not "unrepresented players":
-- NO_AGENCY_LISTED is what a source displayed on a date, never a legal fact.
-- The UI carries that caveat and so does this comment.
-- ----------------------------------------------------------------------------
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
  rep.status        as representation_status,
  rep.agency_name,
  rep.last_checked_at as representation_checked_at,
  rep.source_url      as representation_source_url,
  val.value_amount    as market_value,
  trend.change_12m_pct as value_change_12m_pct,
  ct.expires_on        as contract_expires_on,
  case when ct.expires_on is not null
       then round((ct.expires_on - current_date)::numeric / 30.44) end as contract_months_remaining,
  tm.url as transfermarkt_url
from players p
left join clubs c                        on c.id = p.current_club_id
left join countries nat                  on nat.id = p.nationality_country_id
left join v_player_representation rep    on rep.player_id = p.id
left join v_player_current_value val     on val.player_id = p.id
left join v_player_value_trend trend     on trend.player_id = p.id
left join contracts ct                   on ct.player_id = p.id
left join player_external_ids tm         on tm.player_id = p.id
                                        and tm.provider_code in ('TRANSFERMARKT', 'TRANSFERMARKT_DATASET');

comment on view v_representation_opportunities is
  'Representation research queue. NO_AGENCY_LISTED records what a source displayed on a date; it is not evidence a player is unrepresented.';
