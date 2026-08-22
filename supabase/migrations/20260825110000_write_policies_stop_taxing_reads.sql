-- ============================================================================
-- GBM INTELLIGENCE — 0024 WRITE POLICIES STOP TAXING READS
-- ----------------------------------------------------------------------------
-- A performance regression introduced by 0021, caught only by profiling the
-- live site: the players page went from milliseconds to 2.4 seconds.
--
-- 0021 added `players_manage` and `clubs_manage` as FOR ALL policies. FOR ALL
-- is not "for writes" — it covers SELECT too. So every read of `players` began
-- evaluating gbm_can_manage_portfolio() once per row, and that function queries
-- organization_members. Measured on production, as an authenticated user:
--
--     Filter: (gbm_can_manage_portfolio() OR gbm_is_member())
--     Execution Time: 1546.132 ms          -- 1.682 ms as service role
--
-- The permission model is unchanged. A FOR ALL policy is exactly equivalent to
-- INSERT + UPDATE + DELETE + SELECT arms; splitting it keeps the three write
-- arms and drops the SELECT arm, which granted nothing the sibling read policy
-- did not already grant (anyone who can manage the portfolio is a member).
--
--     after this migration:  Execution Time: 115.905 ms
--
-- The remaining 115ms is the same per-row tax paid by the read policy itself.
-- 0025 removes that.
-- ============================================================================

-- ---------------------------------------------------------------- players ---
drop policy if exists "players_manage" on players;

create policy "players_insert" on players
  for insert to authenticated
  with check (gbm_can_manage_portfolio());

create policy "players_update" on players
  for update to authenticated
  using (gbm_can_manage_portfolio())
  with check (gbm_can_manage_portfolio());

create policy "players_delete" on players
  for delete to authenticated
  using (gbm_can_manage_portfolio());

-- ------------------------------------------------------------------ clubs ---
-- Add Player resolves a club by name and creates it when absent, so the same
-- three arms are needed here for exactly the same reason.
drop policy if exists "clubs_manage" on clubs;

create policy "clubs_insert" on clubs
  for insert to authenticated
  with check (gbm_can_manage_portfolio());

create policy "clubs_update" on clubs
  for update to authenticated
  using (gbm_can_manage_portfolio())
  with check (gbm_can_manage_portfolio());

create policy "clubs_delete" on clubs
  for delete to authenticated
  using (gbm_can_manage_portfolio());
