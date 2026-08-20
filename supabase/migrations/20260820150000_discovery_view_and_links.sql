-- ============================================================================
-- GBM INTELLIGENCE — 0013 DISCOVERY VIEW, LINK REGISTRY, FAN-OUT FIX
-- ----------------------------------------------------------------------------
-- Three things, found and shaped by testing against the imported production
-- data:
--
-- 1. v_representation_opportunities fanned out after Reep v1 resolution: its
--    external-id join matched TRANSFERMARKT and TRANSFERMARKT_DATASET, and
--    resolved players now carry BOTH, so the players list showed 4,056 rows
--    for 2,030 players. The join becomes a lateral single-row pick. The
--    contracts join gets the same guard — today one row per player, but the
--    natural key permits one per club, and a view must not depend on that
--    staying true.
--
-- 2. v_player_discovery: the discovery surface needs current-season counting
--    statistics, per-90s and a league dimension beside identity, value and
--    representation. One row per player, security_invoker like every other
--    view. Per-90 rates are NULL under 270 minutes — a rate on 40 minutes is
--    noise wearing a number's clothes. matches_started stays absent: the
--    dataset does not carry it, and the platform does not invent columns.
--
-- 3. player_links: official public references for a player (club page,
--    federation page, verified social profiles), entered by GBM staff by
--    hand. This is a registry of legitimate URLs — never scraped content,
--    never contact information.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Representation queue, deduplicated
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
left join lateral (
  select expires_on from contracts
  where player_id = p.id
  order by updated_at desc
  limit 1
) ct on true
left join lateral (
  select url from player_external_ids e
  where e.player_id = p.id
    and e.provider_code in ('TRANSFERMARKT', 'TRANSFERMARKT_DATASET')
  order by case e.provider_code when 'TRANSFERMARKT_DATASET' then 0 else 1 end,
           e.created_at
  limit 1
) tm on true;

comment on view v_representation_opportunities is
  'Representation research queue, one row per player. NO_AGENCY_LISTED records what a source displayed on a date; it is not evidence a player is unrepresented.';

-- ----------------------------------------------------------------------------
-- 2. Discovery view — identity + value + representation + current season
-- ----------------------------------------------------------------------------
create or replace view v_player_discovery with (security_invoker = on) as
with current_season as (
  select max(se.name) as name
  from seasons se
  where exists (select 1 from player_season_stats s where s.season_id = se.id)
),
season_totals as (
  select
    s.player_id,
    sum(s.matches_played)  as season_apps,
    sum(s.minutes_played)  as season_minutes,
    sum(s.goals)           as season_goals,
    sum(s.assists)         as season_assists
  from player_season_stats s
  join seasons se on se.id = s.season_id
  where se.name = (select name from current_season)
  group by s.player_id
),
top_league as (
  select distinct on (s.player_id)
    s.player_id,
    comp.id   as league_id,
    comp.name as league_name
  from player_season_stats s
  join seasons se on se.id = s.season_id and se.name = (select name from current_season)
  join competitions comp on comp.id = s.competition_id
  order by s.player_id, s.minutes_played desc nulls last
),
top_signal as (
  select distinct on (player_id)
    player_id, signal_type, score
  from discovery_signals
  where is_current
  order by player_id, score desc
)
select
  r.player_id,
  r.full_name,
  r.date_of_birth,
  r.age,
  r.primary_position,
  r.foot,
  r.height_cm,
  r.nationality,
  r.club_name,
  r.representation_status,
  r.agency_name,
  r.market_value,
  r.value_change_12m_pct,
  r.contract_expires_on,
  r.contract_months_remaining,
  p.image_url,
  p.gbm_status,
  p.nationality_country_id,
  p.current_club_id,
  (select name from current_season)             as season_name,
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
from v_representation_opportunities r
join players p on p.id = r.player_id
left join season_totals st on st.player_id = r.player_id
left join top_league   tl  on tl.player_id = r.player_id
left join top_signal   sig on sig.player_id = r.player_id;

comment on view v_player_discovery is
  'Discovery surface: one row per player with current-season counting statistics, per-90 rates (NULL under 270 minutes), primary league, value, representation and strongest current signal. Advanced metrics are absent until a licensed provider supplies them.';

-- ----------------------------------------------------------------------------
-- 3. Official link registry
-- ----------------------------------------------------------------------------
create table if not exists player_links (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  kind        text not null check (kind in
                ('INSTAGRAM','X','FACEBOOK','LINKEDIN','TIKTOK','YOUTUBE','WEBSITE','CLUB_PAGE','FEDERATION','OTHER')),
  url         text not null check (url ~* '^https?://'),
  label       text,
  added_by    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (player_id, kind, url)
);

comment on table player_links is
  'Official public references for a player, entered by GBM staff. Legitimate URLs only — never scraped content, never contact details.';

create index if not exists player_links_player_idx on player_links(player_id);

alter table player_links enable row level security;

create policy player_links_select on player_links
  for select to authenticated using (true);

create policy player_links_write on player_links
  for all to authenticated using (true) with check (true);

grant select on v_player_discovery to authenticated;
grant select, insert, update, delete on player_links to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Shortlist workflow vocabulary
-- ----------------------------------------------------------------------------
-- The recruitment pipeline runs discovered → monitoring → scout requested →
-- high priority → contacted → negotiating → (represented by GBM | rejected |
-- archived). The original enum values remain valid — existing rows keep their
-- meaning and stay selectable — the pipeline stages are added beside them.
alter type watchlist_status add value if not exists 'DISCOVERED';
alter type watchlist_status add value if not exists 'MONITORING';
alter type watchlist_status add value if not exists 'SCOUT_REQUESTED';
alter type watchlist_status add value if not exists 'CONTACTED';
alter type watchlist_status add value if not exists 'NEGOTIATING';
alter type watchlist_status add value if not exists 'REJECTED';
alter type watchlist_status add value if not exists 'REPRESENTED_BY_GBM';
