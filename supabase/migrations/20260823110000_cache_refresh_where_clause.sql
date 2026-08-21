-- ============================================================================
-- GBM INTELLIGENCE — 0017 CACHE REFRESH UNDER pg_safeupdate
-- ----------------------------------------------------------------------------
-- Supabase loads pg_safeupdate on the PostgREST connection path, so the
-- whole-table UPDATE inside gbm_refresh_player_caches() — intentional: every
-- player's caches refresh — was rejected with "UPDATE requires a WHERE
-- clause" when the pipeline invoked it over RPC (direct connections allowed
-- it, which is why local validation and the first production run passed).
-- The fix is an always-true predicate on the primary key. Function body is
-- otherwise identical to 0016.
-- ============================================================================
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
       ) sig on true)
  where p.id is not null; -- always true: satisfies pg_safeupdate on the RPC path

  get diagnostics n = row_count;
  return n;
end;
$$;
