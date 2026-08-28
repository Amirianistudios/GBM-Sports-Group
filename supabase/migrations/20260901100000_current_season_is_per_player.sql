-- ============================================================================
-- GBM INTELLIGENCE — 0040 "CURRENT SEASON" IS PER PLAYER, NOT GLOBAL
-- ----------------------------------------------------------------------------
-- The cached columns feed almost every surface: discovery sorting, the
-- dashboard blocks, the portfolio cards and the recruitment engine's
-- statistical and competition components. `gbm_refresh_player_caches()`
-- populated them by first choosing one "current season" for the whole
-- database —
--
--     select max(se.name) from seasons se where <has any stats>
--
-- — and then reading each player's minutes and league from that one season.
--
-- That held while the database was a single Transfermarkt import with one
-- season in flight. It stopped holding the moment the population widened:
--
--     2026/2027      659 players    <- max(name), so this is "current"
--     2026         1,474 players    <- calendar-year leagues, never chosen
--     2025/2026    6,312 players    <- the actual bulk of the data
--
-- `max(name)` is a string comparison, so '2026/2027' wins and 12,600 players
-- whose most recent record is 2025/2026 get NULL minutes and NULL league. The
-- calendar-year leagues — Kazakhstan, Uzbekistan, Ghana, and every other
-- spring-autumn competition, named '2026' — can never be selected at all,
-- because '2026' sorts below '2026/2027'.
--
-- The observable damage, measured before this migration:
--
--     cached_season_minutes    0 of 13,296 players
--     cached_league            1 of 13,296 players
--
-- Both components that depend on them were dead across the entire population,
-- and nothing failed: the recruitment engine scored NULL, reported lower
-- confidence, and looked like it was working correctly on thin data. That is
-- the failure mode this codebase keeps guarding against — a silent
-- degradation that reads as an honest absence.
--
-- THE FIX
--
-- A player's current season is his own most recent season with minutes, not a
-- global constant. The season is chosen per player, ordered by the season's
-- end date where it exists and by name otherwise, so a calendar-year league
-- and a split-year league can coexist without one silencing the other.
--
-- Nothing else about the function changes: same columns, same lateral joins
-- for value, contract and opportunity, same `where p.id is not null` to
-- satisfy pg_safeupdate on the RPC path.
-- ============================================================================

create or replace function gbm_refresh_player_caches()
returns integer
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '300s'
as $function$
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
         cur.season_minutes,
         cur.league_name,
         ct.expires_on,
         sig.score,
         now()
       from (select 1) one
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
       -- This player's own latest season, and the minutes and league that go
       -- with it. Ordering by end_date first lets '2026' (a calendar-year
       -- league that has already finished) and '2026/2027' (in progress) be
       -- compared by when they actually ran rather than by how they are spelt.
       left join lateral (
         select
           sum(s.minutes_played)::int as season_minutes,
           (array_agg(comp.name order by s.minutes_played desc nulls last))[1] as league_name
         from player_season_stats s
         join seasons se on se.id = s.season_id
         left join competitions comp on comp.id = s.competition_id
         where s.player_id = p.id
           and se.id = (
             select se2.id
             from player_season_stats s2
             join seasons se2 on se2.id = s2.season_id
             where s2.player_id = p.id and s2.minutes_played is not null
             order by se2.end_date desc nulls last, se2.name desc
             limit 1
           )
         group by se.id
       ) cur on true
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
       ) sig on true)
  where p.id is not null; -- always true: satisfies pg_safeupdate on the RPC path

  get diagnostics n = row_count;
  return n;
end;
$function$;

comment on function gbm_refresh_player_caches is
  'Refreshes the cached player columns. Each player''s current season is his own most recent season with minutes — a global max(season.name) silenced every player outside one season and every calendar-year league.';
