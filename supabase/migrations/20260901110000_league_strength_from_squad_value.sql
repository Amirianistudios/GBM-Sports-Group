-- ============================================================================
-- GBM INTELLIGENCE — 0041 LEAGUE STRENGTH, DERIVED RATHER THAN ASSERTED
-- ----------------------------------------------------------------------------
-- `competitions.strength_rating` has been NULL for all 78 competitions since
-- the column was created, so `competition_fit` — 15% of every recruitment
-- score — has never contributed anything. The component was not broken; it
-- simply had no input.
--
-- Nobody is going to hand-rate 78 leagues, and a rating invented per league
-- would be exactly the fabricated football data this codebase refuses to
-- store. So it is computed from something already in the database and already
-- sourced: the median market value of the players who played in each league.
--
-- WHY THE JOIN IS BY ID, NOT BY NAME
--
-- The obvious join is `players.cached_league` against `competitions.name`, and
-- it is wrong. A cached league is a *name*, and names are not unique across
-- countries. Joining on one pooled every squad that shared a spelling:
--
--     bundesliga    Germany     48.2  <- Austria inherited Germany's squad
--     bundesliga    Austria     48.2
--     premier-liga  Russia      40.1  <- Russia inherited Ukraine's
--     premier-liga  Ukraine     40.1
--
-- Four leagues, two values, and no way to tell from the output that anything
-- had gone wrong. `player_season_stats.competition_id` is a real foreign key
-- and is populated on all 40,326 rows, so the join goes through it. Germany
-- now rates 48.2 and Austria is left unrated for want of a squad; Russia rates
-- 46.0 and Ukraine 40.1, separately and correctly.
--
-- Joining by id also recovered four leagues the name join had silently missed
-- altogether — Türkiye, Greece, Denmark and Uzbekistan — because a name that
-- does not match nothing at all looks exactly like a league with no players.
--
-- WHICH PLAYERS COUNT
--
-- Each player is taken at his own latest season with minutes — the same rule
-- `gbm_refresh_player_caches()` uses since 0040 — and counts toward every
-- competition he actually played in that season. A mid-season move across
-- leagues therefore informs both, which is correct: he was a player in both.
--
-- The alternative, crediting each player only to his highest-minutes
-- competition, has a trap. Minutes are nullable, `order by ... desc nulls
-- last` puts the NULL league row behind a cup row that has a number, and a
-- Bundesliga player with unrecorded league minutes gets filed under the
-- DFB-Pokal — removed from the league he plays in. Counting every appearance
-- sidesteps the ordering question entirely.
--
-- WHY MEDIAN, AND WHY ONLY LEAGUES
--
-- The mean is useless here. LaLiga averages 9.1m and has a median of 1.5m —
-- a handful of superstars drag it six times above the league's real middle.
-- Worse, the top of the mean table was not leagues at all: the UEFA Super Cup
-- came first at 62m across six players, because a one-off fixture between two
-- elite squads is not a competition anyone plays a season in.
--
-- So cups, continental competitions, youth competitions and one-off finals
-- are excluded by tier and by name, and a league needs at least fifteen valued
-- players before it is rated at all. Below that the median is noise, and a
-- noisy rating is worse than an honest NULL — an unrated league still scores
-- NULL and lowers confidence, exactly as before.
--
-- The name patterns are a backstop for a tier column that reads UNKNOWN on
-- half the population, including the Premier League and the Europa League
-- alike. They are written narrowly: `super[-_ ]?(cup|copa|coppa)` catches the
-- Belgian Supercup without catching Süper Lig, Superliga, Super League 1 or
-- the Uzbekistan Superliga — a bare `super` excluded all four top divisions.
--
-- THE SCALE
--
-- Market values span orders of magnitude, so the rating is logarithmic
-- between two fixed anchors: 25,000 EUR maps to 0 and 25,000,000 maps to 100.
-- The anchors are constants rather than the observed min and max on purpose —
-- data-dependent bounds would re-scale every existing league each time a new
-- one was imported, so a club's shortlist would shift for reasons that have
-- nothing to do with the players on it.
--
-- On the current population this yields 16.7 for the weakest rated league and
-- 63.4 for the Premier League, leaving headroom above for the leagues GBM does
-- not yet track. The ladder — Premier League 63.4, LaLiga and Serie A 59.3,
-- Ligue 1 and the Jupiler Pro League 53.4, Bundesliga 48.2, Russia 46.0,
-- Liga Portugal 43.4, Eredivisie and Ukraine 40.1, Denmark and Greece 36.0,
-- Eerste Divisie 35.5, Kazakhstan 30.5, Uzbekistan 29.7, Erovnuli Liga 24.9,
-- Tweede Divisie 16.7 — is football-plausible, which is the only external
-- check available for a derived number.
--
-- REFRESHING IS SELF-CORRECTING
--
-- The update writes NULL to competitions that no longer qualify, not just a
-- value to those that do. A first run of this function rated the Europa League
-- at 56.0 through a gap in the name patterns; tightening the patterns has to
-- actually clear that number, or the stale rating outlives the bug that
-- produced it. `strength_rating` is owned by this function in full.
--
-- THE LIMITATION, STATED PLAINLY
--
-- This is a proxy. Median squad value correlates with league strength but is
-- not a measurement of it: a league that is poorly covered in this database
-- will read as weaker than it is, and wage-rich leagues with low transfer
-- values will read low. It also shares an input with `financial_fit`, so the
-- two components are correlated rather than independent.
--
-- It is labelled accordingly everywhere it surfaces: the reason string says
-- median squad value, not "rated by" anyone. When a licensed ranking becomes
-- available, this function is the single place to replace.
-- ============================================================================

create or replace function gbm_refresh_competition_strength()
returns integer
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $fn$
declare
  n integer;
begin
  with appearances as (
    -- One row per (competition, player) at the player's own latest season.
    select distinct s.competition_id, p.id as player_id, p.cached_market_value as mv
    from players p
    join player_season_stats s on s.player_id = p.id
    join seasons se on se.id = s.season_id
    where p.cached_market_value is not null
      and s.minutes_played > 0
      and se.id = (
        select se2.id
        from player_season_stats s2
        join seasons se2 on se2.id = s2.season_id
        where s2.player_id = p.id and s2.minutes_played is not null
        order by se2.end_date desc nulls last, se2.name desc
        limit 1
      )
  ),
  med as (
    select
      a.competition_id as id,
      percentile_cont(0.5) within group (order by a.mv) as med,
      count(*) as valued
    from appearances a
    join competitions c on c.id = a.competition_id
    where coalesce(c.tier::text, 'UNKNOWN') not in ('CUP', 'CONTINENTAL')
      and coalesce(c.is_youth, false) = false
      -- Narrow on purpose: see the header. `super[-_ ]?(cup|copa|coppa)` must
      -- not become a bare `super`.
      and c.name !~* 'cup|shield|trophy|friendly|qualifying|qualification|playoff|play-off|super[-_ ]?(cup|copa|coppa)'
      -- The tier column reads UNKNOWN for most UEFA competitions, so they are
      -- excluded by name too. A continental knockout is not a league anyone
      -- can be scouted out of.
      and c.name !~* 'uefa|champions|europa|conference|world|libertadores|copa'
    group by a.competition_id
  ),
  target as (
    -- Every competition, not only the qualifying ones: a competition that has
    -- stopped qualifying must have its rating cleared.
    select
      c.id,
      case when m.valued >= 15 and m.med > 0 then
        -- percentile_cont returns double precision, and round(double, int)
        -- does not exist in Postgres; the cast is required, not cosmetic.
        round(greatest(0, least(100,
          (ln(m.med::numeric) - ln(25000::numeric))
          / (ln(25000000::numeric) - ln(25000::numeric)) * 100
        ))::numeric, 1)
      end as rating
    from competitions c
    left join med m on m.id = c.id
  )
  update competitions c
     set strength_rating = t.rating,
         updated_at = now()
    from target t
   where c.id = t.id
     and c.strength_rating is distinct from t.rating;

  -- Rows actually changed, so a settled database returns 0 rather than
  -- reporting work it did not do.
  get diagnostics n = row_count;
  return n;
end $fn$;

comment on function gbm_refresh_competition_strength is
  'Derives competitions.strength_rating from the median market value of players who appeared in each competition, joined by player_season_stats.competition_id and log-scaled between fixed 25k and 25m anchors. Leagues only, minimum fifteen valued players; non-qualifying competitions are cleared to NULL. Returns rows changed. A proxy for league strength, not a measurement of it.';

revoke all on function gbm_refresh_competition_strength() from public, anon;
grant execute on function gbm_refresh_competition_strength() to authenticated;

-- Recompute here, in the migration. The guard below asserts against the
-- contents of `competitions`, so it has to be this definition's output being
-- checked and not whatever a previous one left behind — and a rating nobody
-- has computed yet is a column that stays NULL until someone remembers to
-- call the function.
select gbm_refresh_competition_strength();

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
-- Each assertion is a bug this function actually shipped once, except the
-- range check.
-- ----------------------------------------------------------------------------
do $$
declare v_bad text;
begin
  -- The competitions that topped the mean table before they were filtered out.
  select string_agg(name, ', ') into v_bad
    from competitions
   where strength_rating is not null
     and (coalesce(tier::text,'UNKNOWN') in ('CUP','CONTINENTAL')
          or name ~* 'cup|shield|trophy|qualifying|uefa|champions|europa|conference|libertadores'
          or coalesce(is_youth,false));
  if v_bad is not null then
    raise exception 'cups or continental competitions were rated as leagues: %', v_bad;
  end if;

  if exists (select 1 from competitions where strength_rating is not null
              and (strength_rating < 0 or strength_rating > 100)) then
    raise exception 'a strength_rating fell outside 0-100';
  end if;

  -- The false positive that a bare `super` would reintroduce: four top
  -- divisions whose names begin with it. Named individually because the point
  -- is that these particular leagues must survive the cup filter.
  select string_agg(name, ', ') into v_bad
    from competitions
   where name ~* '^(super-lig|superliga|super-league)'
     and strength_rating is null
     and exists (
       select 1 from player_season_stats s
       join players p on p.id = s.player_id and p.cached_market_value is not null
       where s.competition_id = competitions.id and s.minutes_played > 0
       group by s.competition_id having count(distinct p.id) >= 15
     );
  if v_bad is not null then
    raise exception 'a top division was excluded by the supercup pattern: %', v_bad;
  end if;

  -- Every rated competition must actually clear the sample minimum; a median
  -- over a handful of players is noise wearing a number.
  select string_agg(c.name, ', ') into v_bad
    from competitions c
   where c.strength_rating is not null
     and (select count(distinct s.player_id)
            from player_season_stats s
            join players p on p.id = s.player_id and p.cached_market_value is not null
           where s.competition_id = c.id and s.minutes_played > 0) < 15;
  if v_bad is not null then
    raise exception 'a competition was rated on fewer than fifteen valued players: %', v_bad;
  end if;
end $$;
