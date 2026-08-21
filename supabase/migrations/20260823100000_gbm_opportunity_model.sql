-- ============================================================================
-- GBM INTELLIGENCE — 0016 GBM OPPORTUNITY MODEL
-- ----------------------------------------------------------------------------
-- Sprint 1.5: the platform's job is agency opportunity discovery, not a
-- market-value leaderboard. This migration gives the database that opinion,
-- explicitly and auditable:
--
--  A. gbm_target_markets — the agency's primary markets as data, not as
--     strings buried in SQL. citizenship_target covers markets whose players
--     GBM follows wherever they play (Georgia, Armenia, Senegal, …);
--     league_target covers countries whose top division the current dataset
--     actually carries (verified against competitions.csv on 2026-08-21).
--
--  B. Cached list columns on players — every list surface sorts and filters
--     on plain indexed columns instead of evaluating per-player laterals for
--     the whole table. Caches are derived display state, refreshed by the
--     pipeline (gbm_refresh_player_caches), never authored by hand. Source
--     facts remain in market_values / contracts / player_season_stats /
--     discovery_signals; disagreement between cache and facts is resolved by
--     re-running the refresh, never by editing the cache.
--
--  C. GBM_OPPORTUNITY signal (model v2) — a 0–100 composite computed only
--     from stored facts, with the contributing factors written into the
--     rationale, because a score GBM cannot explain is a score GBM cannot
--     act on. Factors: age curve, target league, target citizenship,
--     realistic value band, league minutes, contract window, value growth.
--     (Senior international caps are used by the import selection but are
--     not yet stored per player, so they are absent here — noted, not
--     silently approximated.)
--
--  D. v_player_discovery — re-emitted verbatim from 0014 with two additive
--     changes: the top-signal lateral now excludes GBM_OPPORTUNITY (it is a
--     composite of the others and would otherwise mask every specific
--     signal), and cached_opportunity is appended as gbm_opportunity.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Target markets
-- ----------------------------------------------------------------------------
create table if not exists gbm_target_markets (
  country_name       text primary key,
  citizenship_target boolean not null default false,
  league_target      boolean not null default false,
  note               text
);

comment on table gbm_target_markets is
  'GBM primary markets. citizenship_target: players of this nationality are priority wherever they play. league_target: this country''s top division is a priority competition (only meaningful where the dataset carries it).';

insert into gbm_target_markets (country_name, citizenship_target, league_target, note) values
  -- Europe
  ('Albania',            true, false, null),
  ('Armenia',            true, false, 'league not in current dataset'),
  ('Azerbaijan',         true, false, 'league not in current dataset'),
  ('Belgium',            true, true,  null),
  ('Bosnia-Herzegovina', true, false, null),
  ('Bulgaria',           true, false, null),
  ('Croatia',            true, true,  null),
  ('Czech Republic',     true, true,  null),
  ('Estonia',            true, false, null),
  ('Georgia',            true, false, 'league not in current dataset'),
  ('Latvia',             true, false, null),
  ('Lithuania',          true, false, null),
  ('Moldova',            true, false, null),
  ('Montenegro',         true, false, null),
  ('North Macedonia',    true, false, null),
  ('Poland',             true, true,  null),
  ('Romania',            true, true,  null),
  ('Serbia',             true, true,  null),
  ('Slovakia',           true, false, null),
  ('Slovenia',           true, false, null),
  ('Ukraine',            true, true,  null),
  -- Central Asia
  ('Kazakhstan',         true, false, 'league not in current dataset'),
  ('Uzbekistan',         true, false, 'league not in current dataset'),
  -- Asia
  ('Japan',              true, true,  null),
  ('Korea, South',       true, true,  null),
  -- South America
  ('Argentina',          true, true,  null),
  ('Bolivia',            true, false, null),
  ('Brazil',             true, true,  null),
  ('Colombia',           true, false, null),
  ('Ecuador',            true, false, null),
  ('Paraguay',           true, false, null),
  ('Uruguay',            true, false, null),
  -- Africa
  ('Cote d''Ivoire',     true, false, null),
  ('Egypt',              true, false, null),
  ('Ghana',              true, false, null),
  ('Morocco',            true, false, null),
  ('Nigeria',            true, false, null),
  ('Rwanda',             true, false, 'league not in current dataset'),
  ('Senegal',            true, false, null),
  ('South Africa',       true, false, null)
on conflict (country_name) do update
  set citizenship_target = excluded.citizenship_target,
      league_target      = excluded.league_target,
      note               = excluded.note;

alter table gbm_target_markets enable row level security;

drop policy if exists gbm_target_markets_select on gbm_target_markets;
create policy gbm_target_markets_select on gbm_target_markets
  for select to authenticated using (gbm_is_member());

-- ----------------------------------------------------------------------------
-- B. Cached list columns
-- ----------------------------------------------------------------------------
alter table players
  add column if not exists cached_market_value     bigint,
  add column if not exists cached_value_change_pct numeric(8,1),
  add column if not exists cached_season_minutes   integer,
  add column if not exists cached_league           text,
  add column if not exists cached_contract_expires date,
  add column if not exists cached_opportunity      numeric(6,3),
  add column if not exists caches_refreshed_at     timestamptz;

comment on column players.cached_opportunity is
  'Derived: GBM_OPPORTUNITY signal score. Refreshed by gbm_refresh_player_caches(); never authored.';

create index if not exists idx_players_cached_opportunity
  on players (cached_opportunity desc nulls last);
create index if not exists idx_players_cached_value
  on players (cached_market_value desc nulls last);
create index if not exists idx_players_cached_minutes
  on players (cached_season_minutes desc nulls last);
create index if not exists idx_players_cached_contract
  on players (cached_contract_expires) where cached_contract_expires is not null;

-- ----------------------------------------------------------------------------
-- C. Cache refresh
-- ----------------------------------------------------------------------------
create or replace function gbm_refresh_player_caches()
returns integer
language plpgsql
security definer
set search_path = public
set statement_timeout = '300s'
as $$
declare
  n integer;
begin
  update players p
  set (cached_market_value, cached_value_change_pct, cached_season_minutes,
       cached_league, cached_contract_expires, cached_opportunity,
       caches_refreshed_at)
    = (select
         val.value_amount,
         case when yr.value_amount > 0
              then round((val.value_amount - yr.value_amount) / yr.value_amount * 100, 1)
         end,
         st.season_minutes,
         tl.league_name,
         ct.expires_on,
         sig.score,
         now()
       from (select max(se.name) as name
             from seasons se
             where exists (select 1 from player_season_stats s where s.season_id = se.id)) cs
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
         select comp.name as league_name
         from player_season_stats s
         join seasons se on se.id = s.season_id and se.name = cs.name
         join competitions comp on comp.id = s.competition_id
         where s.player_id = p.id
         order by s.minutes_played desc nulls last limit 1
       ) tl on true
       left join lateral (
         select co.expires_on from contracts co
         where co.player_id = p.id and co.expires_on > current_date
         order by co.expires_on asc limit 1
       ) ct on true
       left join lateral (
         select ds.score from discovery_signals ds
         where ds.player_id = p.id and ds.is_current
           and ds.signal_type = 'GBM_OPPORTUNITY'
         order by ds.computed_at desc limit 1
       ) sig on true);

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function gbm_refresh_player_caches is
  'Recomputes the derived list columns on players from stored facts. Idempotent; run after every import and signal recompute.';

revoke execute on function gbm_refresh_player_caches() from public, anon, authenticated;
grant  execute on function gbm_refresh_player_caches() to service_role;

-- ----------------------------------------------------------------------------
-- D. Signals model v2: existing branches unchanged, plus GBM_OPPORTUNITY.
--    v1 rows are deleted (superseded generation), and the function now ends
--    by refreshing the player caches so one RPC leaves the platform coherent.
-- ----------------------------------------------------------------------------
create or replace function gbm_compute_discovery_signals()
returns table (signal_type text, inserted int)
language plpgsql
security definer
set search_path = public
set statement_timeout = '300s'
as $$
declare
  model constant text := 'v2';
begin
  delete from discovery_signals where model_version in ('v1', model);

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
    least(100, s.age_pts + s.league_pts + s.citizenship_pts + s.value_pts
                + s.minutes_pts + s.contract_pts + s.growth_pts)::numeric(6,3),
    concat_ws(' · ',
      case when s.years is null then 'age unknown (+' || s.age_pts || ')'
           else 'age ' || s.years || ' (+' || s.age_pts || ')' end,
      case when s.league_pts > 0 then 'target league: ' || s.league_name || ' (+' || s.league_pts || ')' end,
      case when s.citizenship_pts > 0 then 'target market: ' || s.citizenship || ' (+' || s.citizenship_pts || ')' end,
      case when s.value_amount is null then 'value unknown (+' || s.value_pts || ')'
           else 'value €' || to_char(s.value_amount, 'FM999,999,999') || ' (+' || s.value_pts || ')' end,
      case when s.minutes_pts > 0 then s.season_minutes || ' league minutes (+' || s.minutes_pts || ')' end,
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
      case when coalesce(b.season_minutes, 0) >= 900 then 9
           when coalesce(b.season_minutes, 0) >= 450 then 5
           else 0 end as minutes_pts,
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
  'Recomputes the current discovery signal set (model v2, including the GBM_OPPORTUNITY composite) from stored facts, then refreshes the derived list caches. Idempotent; at most one row per player per signal type.';

-- ----------------------------------------------------------------------------
-- E. v_player_discovery — verbatim from 0014 except: the top-signal lateral
--    excludes the composite (a composite of the other signals must not mask
--    them), and gbm_opportunity is appended at the end (append-only safe).
-- ----------------------------------------------------------------------------
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
  p.created_at    as added_at,
  p.cached_opportunity as gbm_opportunity
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
    and ds.signal_type <> 'GBM_OPPORTUNITY'
  order by ds.score desc
  limit 1
) sig on true;

comment on view v_player_discovery is
  'Discovery surface: one row per player with current-season counting statistics, per-90 rates (NULL under 270 minutes), primary league, value, representation, strongest specific signal, and the GBM opportunity composite. Advanced metrics are absent until a licensed provider supplies them. Computed via per-player lateral index lookups so point queries and the list stay far inside the statement timeout.';
