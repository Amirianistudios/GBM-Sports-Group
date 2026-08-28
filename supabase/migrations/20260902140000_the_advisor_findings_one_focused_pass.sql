-- ============================================================================
-- GBM INTELLIGENCE — 0049 THE ADVISOR FINDINGS, ONE FOCUSED PASS
-- ----------------------------------------------------------------------------
-- The 2026-08-28 performance audit (docs/UX_PERFORMANCE_AUDIT.md) ran the
-- Supabase advisors and then verified each finding against the catalog before
-- acting. This migration fixes exactly what was verified, and nothing that
-- was merely listed:
--
--   FIXED   the one duplicate index — verified byte-identical in pg_indexes
--   FIXED   the doubled SELECT policy on player_links — restructured with an
--           unchanged access surface
--   FIXED   four unindexed foreign keys with a named, measured consumer each
--
--   LEFT    the other 72 "unindexed foreign key" INFOs — cold paths with no
--           consumer to justify the write cost
--   LEFT    all 31 "unused index" INFOs — usage statistics on a six-day-old
--           restore are not evidence, and several serve weekly ingestion.
--           Deleting on that basis is how you delete the index next month
--           needs. Revisit when the statistics have months behind them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The duplicate index. Both were (signal_type, score DESC) WHERE
--    is_current; the advisor flags the pair and separately lists
--    _type_score_idx as unused. Every write to discovery_signals maintained
--    both. _current_type_idx (the earlier, documented one) stays.
-- ----------------------------------------------------------------------------
drop index if exists discovery_signals_type_score_idx;

-- ----------------------------------------------------------------------------
-- 2. player_links carried a SELECT policy and a FOR ALL policy, so every read
--    evaluated two permissive policies. Splitting the FOR ALL into its three
--    write actions leaves one policy per action and the exact same answer to
--    every request: authenticated members read and write, as before.
-- ----------------------------------------------------------------------------
drop policy if exists player_links_write on player_links;

create policy player_links_insert on player_links
  for insert to authenticated with check (true);
create policy player_links_update on player_links
  for update to authenticated using (true) with check (true);
create policy player_links_delete on player_links
  for delete to authenticated using (true);

-- ----------------------------------------------------------------------------
-- 3. Foreign-key indexes with a named consumer. Each one is here because a
--    specific query path was observed to scan without it — not because the
--    advisor printed the table's name.
-- ----------------------------------------------------------------------------

-- gbm_refresh_competition_strength (0041) joins player_season_stats to
-- competitions through this column for every rated league, the
-- stats_without_competition quality check scans it, and Phase B2's cohort
-- engine groups by (competition, season). The table is 40k rows and growing
-- with every weekly import.
create index if not exists player_season_stats_competition_idx
  on player_season_stats (competition_id);

-- The remaining three are the only children of players.id left without an
-- index on their foreign key. gbm_merge_player walks every child table with
-- repeated `where player_id = $1` probes, and Postgres itself must run the
-- same lookup on every player DELETE to enforce the constraint — each one a
-- sequential scan until now.
create index if not exists alerts_player_idx
  on alerts (player_id);
create index if not exists recruitment_matches_player_idx
  on recruitment_matches (player_id);
create index if not exists player_rankings_player_idx
  on player_rankings (player_id);

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
do $$
declare v_n int;
begin
  -- Exactly one partial (signal_type, score) index must remain.
  select count(*) into v_n from pg_indexes
   where tablename = 'discovery_signals'
     and indexdef like '%(signal_type, score DESC) WHERE is_current%';
  if v_n <> 1 then
    raise exception 'expected exactly one current-type index on discovery_signals, found %', v_n;
  end if;

  -- player_links: one policy per action, none doubled.
  select count(*) into v_n from pg_policy
   where polrelid = 'player_links'::regclass and polcmd = 'r';
  if v_n <> 1 then
    raise exception 'player_links must have exactly one SELECT policy, found %', v_n;
  end if;
  select count(*) into v_n from pg_policy
   where polrelid = 'player_links'::regclass and polcmd = '*';
  if v_n <> 0 then
    raise exception 'player_links must no longer carry a FOR ALL policy';
  end if;
  -- The write surface survives: insert, update and delete each covered once.
  select count(distinct polcmd) into v_n from pg_policy
   where polrelid = 'player_links'::regclass and polcmd in ('a', 'w', 'd');
  if v_n <> 3 then
    raise exception 'player_links write actions are no longer fully covered';
  end if;

  -- The four justified indexes exist.
  select count(*) into v_n from pg_indexes where indexname in (
    'player_season_stats_competition_idx', 'alerts_player_idx',
    'recruitment_matches_player_idx', 'player_rankings_player_idx');
  if v_n <> 4 then
    raise exception 'expected the four justified FK indexes, found %', v_n;
  end if;
end $$;
