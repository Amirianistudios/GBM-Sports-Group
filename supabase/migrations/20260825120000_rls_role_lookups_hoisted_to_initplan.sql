-- ============================================================================
-- GBM INTELLIGENCE — 0025 RLS ROLE LOOKUPS HOISTED TO AN INITPLAN
-- ----------------------------------------------------------------------------
-- 0024 stopped write policies from being evaluated on reads. This removes the
-- remaining per-row cost, which the read policies were paying themselves.
--
-- `gbm_is_member()` and its siblings are STABLE SECURITY DEFINER functions that
-- query organization_members. Written bare in a policy —
--
--     using (gbm_is_member())
--
-- — Postgres treats the call as part of the row filter and evaluates it once
-- per row. Wrapped in a scalar subquery —
--
--     using ((select gbm_is_member()))
--
-- — it becomes an InitPlan: evaluated once for the whole statement and reused.
-- The functions take no arguments and read nothing from the row, so the two
-- forms are semantically identical. Measured on production, on `players`:
--
--     Filter: gbm_is_member()          Execution Time:  115.905 ms
--     Filter: (InitPlan 1).col1        Execution Time:    2.385 ms
--
-- Against the 1546ms the same query cost before 0024, that is a 650x recovery,
-- and it does not decay as the table grows — the lookup no longer scales with
-- row count at all.
--
-- Supabase's own performance advisor flags fourteen of these (`auth_rls_initplan`),
-- but it only recognises `auth.<fn>()` and `current_setting()`. It cannot see
-- the custom role helpers, which are the expensive ones: `auth.uid()` reads a
-- GUC, while `gbm_is_member()` runs a query. This migration covers both.
--
-- ACCESS IS UNCHANGED. That is the whole point, so it was verified rather than
-- assumed, three ways:
--
--   1. Per-role visible row counts across all 53 policied tables, captured for
--      OWNER, EXECUTIVE_DIRECTOR and PLAYER_SERVICE_SCOUT before and after.
--   2. A truth table over all 8 role states x 4 row states for each of the four
--      policies whose predicate had to be restructured (below) — 0 mismatches.
--   3. The guard at the foot of this file, which fails the migration if any
--      policy is left evaluating a role lookup per row.
--
-- Four FOR ALL policies needed care. Their SELECT arm granted reads that the
-- sibling read policy did not: an OWNER could read another author's private
-- note, any writer could read a draft report's sections. Splitting the policy
-- would have silently revoked that. This migration is about cost, not access,
-- so each of those grants is preserved — written explicitly into the read
-- policy, where it is visible and reviewable instead of incidental.
--
-- Whether those four grants are *wanted* is a separate question this migration
-- deliberately does not answer. See docs/CURRENT_STATE.md.
-- ============================================================================

-- ============================================================================
-- PART A — the uniform read policies
-- ----------------------------------------------------------------------------
-- Forty-odd tables carry the identical policy `using (gbm_is_member())`. The
-- loop matches the predicate *exactly*, so it can only touch policies whose
-- entire condition is one of these two calls — never a policy that also tests a
-- column. Anything with a row predicate is rewritten by hand in Part B.
-- ============================================================================
do $$
declare r record;
begin
  for r in
    select tablename, policyname, qual
    from pg_policies
    where schemaname = 'public'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and roles::text = '{authenticated}'
      and qual in ('gbm_is_member()', 'gbm_can_view_guardian_data()')
    order by tablename, policyname
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select %s))',
      r.policyname, r.tablename, r.qual
    );
  end loop;
end $$;

-- `players` was hoisted by hand while the regression was being traced; it is
-- restated here so this file alone reproduces the finished state.
drop policy if exists "members can read" on players;
create policy "members can read" on players
  for select to authenticated
  using ((select gbm_is_member()));

-- ============================================================================
-- PART B — read policies that also test a column
-- ----------------------------------------------------------------------------
-- Rewritten individually: only the role lookup and auth.uid() move into a
-- subquery, the column predicates stay exactly as they were.
-- ============================================================================

-- ----------------------------------------------------------------- alerts ---
drop policy if exists "read own alerts" on alerts;
create policy "read own alerts" on alerts
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "update own alerts" on alerts;
create policy "update own alerts" on alerts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- --------------------------------------------------------------- profiles ---
drop policy if exists "read own profile and teammates" on profiles;
create policy "read own profile and teammates" on profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select gbm_is_member()));

drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------- organization_members ---
drop policy if exists "read own membership" on organization_members;
create policy "read own membership" on organization_members
  for select to authenticated
  using (user_id = (select auth.uid()) or (select gbm_is_member()));

-- --------------------------------------------- entity_resolution_candidates ---
drop policy if exists "update resolution candidates" on entity_resolution_candidates;
create policy "update resolution candidates" on entity_resolution_candidates
  for update to authenticated
  using ((select gbm_can_write()))
  with check ((select gbm_can_write()));

-- ------------------------------------------------------------ player_notes ---
-- Preserves the OWNER/ADMIN read of another author's private note that the old
-- FOR ALL write policy granted through its SELECT arm.
drop policy if exists "read notes" on player_notes;
create policy "read notes" on player_notes
  for select to authenticated
  using (
    (select gbm_is_member())
    and (
      not is_private
      or author_id = (select auth.uid())
      or (select gbm_current_user_role()) = any (array['OWNER', 'ADMIN']::gbm_role[])
    )
  );

-- -------------------------------------------------------- scouting_reports ---
-- Same shape: OWNER/ADMIN keep their read of another scout's draft.
drop policy if exists "read reports" on scouting_reports;
create policy "read reports" on scouting_reports
  for select to authenticated
  using (
    (select gbm_is_member())
    and (
      not is_draft
      or scout_id = (select auth.uid())
      or (select gbm_current_user_role()) = any (array['OWNER', 'ADMIN']::gbm_role[])
    )
  );

-- ------------------------------------------------ scouting_report_sections ---
-- The old write policy let any writer read every section; that is preserved as
-- an explicit first disjunct rather than left implied by a FOR ALL.
drop policy if exists "read report sections" on scouting_report_sections;
create policy "read report sections" on scouting_report_sections
  for select to authenticated
  using (
    (select gbm_can_write())
    or exists (
      select 1 from scouting_reports r
      where r.id = scouting_report_sections.report_id
        and (not r.is_draft or r.scout_id = (select auth.uid()))
    )
  );

-- ------------------------------------------------------------- watchlists ---
drop policy if exists "read watchlists" on watchlists;
create policy "read watchlists" on watchlists
  for select to authenticated
  using (
    (select gbm_is_member())
    and (is_shared or created_by = (select auth.uid()))
  );

-- ------------------------------------------------------ watchlist_players ---
drop policy if exists "read watchlist players" on watchlist_players;
create policy "read watchlist players" on watchlist_players
  for select to authenticated
  using (
    (select gbm_can_write())
    or (
      (select gbm_is_member())
      and exists (
        select 1 from watchlists w
        where w.id = watchlist_players.watchlist_id
          and (w.is_shared or w.created_by = (select auth.uid()))
      )
    )
  );

-- ============================================================================
-- PART C — the remaining FOR ALL write policies
-- ----------------------------------------------------------------------------
-- Same regression 0024 fixed on players and clubs, on every other table that
-- still had it. Three of these sit on hot read paths — `contracts` and
-- `market_values` are read on every player profile, `gbm_portfolio` on the
-- dashboard and the portfolio page.
--
-- A FOR ALL policy with USING q and WITH CHECK w is equivalent to:
--     INSERT WITH CHECK w · UPDATE USING q WITH CHECK w · DELETE USING q
-- plus a SELECT arm using q. Each split below keeps the three write arms and
-- drops the SELECT arm, which is exactly the read tax being removed.
-- ============================================================================

-- -------------------------------------------------------------- contracts ---
drop policy if exists "contracts_gbm_internal_write" on contracts;
create policy "contracts_gbm_internal_write_insert" on contracts
  for insert to authenticated
  with check ((select gbm_can_manage_portfolio()) and provider_code = 'GBM_INTERNAL');
create policy "contracts_gbm_internal_write_update" on contracts
  for update to authenticated
  using ((select gbm_can_manage_portfolio()) and provider_code = 'GBM_INTERNAL')
  with check ((select gbm_can_manage_portfolio()) and provider_code = 'GBM_INTERNAL');
create policy "contracts_gbm_internal_write_delete" on contracts
  for delete to authenticated
  using ((select gbm_can_manage_portfolio()) and provider_code = 'GBM_INTERNAL');

-- ----------------------------------------------------------- market_values ---
drop policy if exists "market_values_gbm_internal_write" on market_values;
create policy "market_values_gbm_internal_write_insert" on market_values
  for insert to authenticated
  with check ((select gbm_can_manage_portfolio()) and provider_code = 'GBM_INTERNAL');
create policy "market_values_gbm_internal_write_update" on market_values
  for update to authenticated
  using ((select gbm_can_manage_portfolio()) and provider_code = 'GBM_INTERNAL')
  with check ((select gbm_can_manage_portfolio()) and provider_code = 'GBM_INTERNAL');
create policy "market_values_gbm_internal_write_delete" on market_values
  for delete to authenticated
  using ((select gbm_can_manage_portfolio()) and provider_code = 'GBM_INTERNAL');

-- ----------------------------------------------------------- gbm_portfolio ---
drop policy if exists "gbm_portfolio_write" on gbm_portfolio;
create policy "gbm_portfolio_insert" on gbm_portfolio
  for insert to authenticated
  with check ((select gbm_can_manage_portfolio()));
create policy "gbm_portfolio_update" on gbm_portfolio
  for update to authenticated
  using ((select gbm_can_manage_portfolio()))
  with check ((select gbm_can_manage_portfolio()));
create policy "gbm_portfolio_delete" on gbm_portfolio
  for delete to authenticated
  using ((select gbm_can_manage_portfolio()));

-- -------------------------------------------------------- player_guardians ---
drop policy if exists "player_guardians_write" on player_guardians;
create policy "player_guardians_insert" on player_guardians
  for insert to authenticated
  with check ((select gbm_can_view_guardian_data()));
create policy "player_guardians_update" on player_guardians
  for update to authenticated
  using ((select gbm_can_view_guardian_data()))
  with check ((select gbm_can_view_guardian_data()));
create policy "player_guardians_delete" on player_guardians
  for delete to authenticated
  using ((select gbm_can_view_guardian_data()));

-- ------------------------------------------------------ player_live_status ---
drop policy if exists "player_live_status_write" on player_live_status;
create policy "player_live_status_insert" on player_live_status
  for insert to authenticated
  with check ((select gbm_can_write()));
create policy "player_live_status_update" on player_live_status
  for update to authenticated
  using ((select gbm_can_write()))
  with check ((select gbm_can_write()));
create policy "player_live_status_delete" on player_live_status
  for delete to authenticated
  using ((select gbm_can_write()));

-- ------------------------------------------------------------- player_news ---
drop policy if exists "player_news_write" on player_news;
create policy "player_news_insert" on player_news
  for insert to authenticated
  with check ((select gbm_can_write()));
create policy "player_news_update" on player_news
  for update to authenticated
  using ((select gbm_can_write()))
  with check ((select gbm_can_write()));
create policy "player_news_delete" on player_news
  for delete to authenticated
  using ((select gbm_can_write()));

-- ------------------------------------------------------------- player_tags ---
drop policy if exists "write player tags" on player_tags;
create policy "insert player tags" on player_tags
  for insert to authenticated with check ((select gbm_can_write()));
create policy "update player tags" on player_tags
  for update to authenticated
  using ((select gbm_can_write())) with check ((select gbm_can_write()));
create policy "delete player tags" on player_tags
  for delete to authenticated using ((select gbm_can_write()));

-- -------------------------------------------------------------------- tags ---
drop policy if exists "write tags" on tags;
create policy "insert tags" on tags
  for insert to authenticated with check ((select gbm_can_write()));
create policy "update tags" on tags
  for update to authenticated
  using ((select gbm_can_write())) with check ((select gbm_can_write()));
create policy "delete tags" on tags
  for delete to authenticated using ((select gbm_can_write()));

-- ------------------------------------------------ entity_resolution_reviews ---
drop policy if exists "write resolution reviews" on entity_resolution_reviews;
create policy "insert resolution reviews" on entity_resolution_reviews
  for insert to authenticated with check ((select gbm_can_write()));
create policy "update resolution reviews" on entity_resolution_reviews
  for update to authenticated
  using ((select gbm_can_write())) with check ((select gbm_can_write()));
create policy "delete resolution reviews" on entity_resolution_reviews
  for delete to authenticated using ((select gbm_can_write()));

-- ---------------------------------------------------- organization_members ---
drop policy if exists "admins manage membership" on organization_members;
create policy "admins insert membership" on organization_members
  for insert to authenticated
  with check ((select gbm_current_user_role()) = any (array['OWNER', 'ADMIN']::gbm_role[]));
create policy "admins update membership" on organization_members
  for update to authenticated
  using ((select gbm_current_user_role()) = any (array['OWNER', 'ADMIN']::gbm_role[]))
  with check ((select gbm_current_user_role()) = any (array['OWNER', 'ADMIN']::gbm_role[]));
create policy "admins delete membership" on organization_members
  for delete to authenticated
  using ((select gbm_current_user_role()) = any (array['OWNER', 'ADMIN']::gbm_role[]));

-- ------------------------------------------------------------ player_notes ---
drop policy if exists "write own notes" on player_notes;
create policy "insert own notes" on player_notes
  for insert to authenticated with check ((select gbm_can_write()));
create policy "update own notes" on player_notes
  for update to authenticated
  using (
    (select gbm_can_write())
    and (
      author_id = (select auth.uid())
      or (select gbm_current_user_role()) = any (array['OWNER', 'ADMIN']::gbm_role[])
    )
  )
  with check ((select gbm_can_write()));
create policy "delete own notes" on player_notes
  for delete to authenticated
  using (
    (select gbm_can_write())
    and (
      author_id = (select auth.uid())
      or (select gbm_current_user_role()) = any (array['OWNER', 'ADMIN']::gbm_role[])
    )
  );

-- ---------------------------------------------------- scout_player_ratings ---
drop policy if exists "write own ratings" on scout_player_ratings;
create policy "insert own ratings" on scout_player_ratings
  for insert to authenticated with check ((select gbm_can_write()));
create policy "update own ratings" on scout_player_ratings
  for update to authenticated
  using ((select gbm_can_write()) and scout_id = (select auth.uid()))
  with check ((select gbm_can_write()));
create policy "delete own ratings" on scout_player_ratings
  for delete to authenticated
  using ((select gbm_can_write()) and scout_id = (select auth.uid()));

-- -------------------------------------------------------- scouting_reports ---
drop policy if exists "write own reports" on scouting_reports;
create policy "insert own reports" on scouting_reports
  for insert to authenticated with check ((select gbm_can_write()));
create policy "update own reports" on scouting_reports
  for update to authenticated
  using (
    (select gbm_can_write())
    and (
      scout_id = (select auth.uid())
      or (select gbm_current_user_role()) = any (array['OWNER', 'ADMIN']::gbm_role[])
    )
  )
  with check ((select gbm_can_write()));
create policy "delete own reports" on scouting_reports
  for delete to authenticated
  using (
    (select gbm_can_write())
    and (
      scout_id = (select auth.uid())
      or (select gbm_current_user_role()) = any (array['OWNER', 'ADMIN']::gbm_role[])
    )
  );

-- ------------------------------------------------ scouting_report_sections ---
drop policy if exists "write report sections" on scouting_report_sections;
create policy "insert report sections" on scouting_report_sections
  for insert to authenticated with check ((select gbm_can_write()));
create policy "update report sections" on scouting_report_sections
  for update to authenticated
  using ((select gbm_can_write())) with check ((select gbm_can_write()));
create policy "delete report sections" on scouting_report_sections
  for delete to authenticated using ((select gbm_can_write()));

-- ------------------------------------------------------------- watchlists ---
drop policy if exists "write watchlists" on watchlists;
create policy "insert watchlists" on watchlists
  for insert to authenticated with check ((select gbm_can_write()));
create policy "update watchlists" on watchlists
  for update to authenticated
  using ((select gbm_can_write()) and (is_shared or created_by = (select auth.uid())))
  with check ((select gbm_can_write()));
create policy "delete watchlists" on watchlists
  for delete to authenticated
  using ((select gbm_can_write()) and (is_shared or created_by = (select auth.uid())));

-- ------------------------------------------------------ watchlist_players ---
drop policy if exists "write watchlist players" on watchlist_players;
create policy "insert watchlist players" on watchlist_players
  for insert to authenticated with check ((select gbm_can_write()));
create policy "update watchlist players" on watchlist_players
  for update to authenticated
  using ((select gbm_can_write())) with check ((select gbm_can_write()));
create policy "delete watchlist players" on watchlist_players
  for delete to authenticated using ((select gbm_can_write()));

-- ------------------------------------------------- players and clubs, again ---
-- 0024 split these six off the read path but left the call bare, which is
-- harmless for reads and not harmless for writes: the importer updates
-- thousands of player rows per run, and an UPDATE ... WHERE re-evaluates the
-- USING clause per candidate row exactly as a SELECT does. The guard below
-- refuses to let a bare call survive anywhere, which is how this was caught.
drop policy if exists "players_insert" on players;
create policy "players_insert" on players
  for insert to authenticated
  with check ((select gbm_can_manage_portfolio()));
drop policy if exists "players_update" on players;
create policy "players_update" on players
  for update to authenticated
  using ((select gbm_can_manage_portfolio()))
  with check ((select gbm_can_manage_portfolio()));
drop policy if exists "players_delete" on players;
create policy "players_delete" on players
  for delete to authenticated
  using ((select gbm_can_manage_portfolio()));

drop policy if exists "clubs_insert" on clubs;
create policy "clubs_insert" on clubs
  for insert to authenticated
  with check ((select gbm_can_manage_portfolio()));
drop policy if exists "clubs_update" on clubs;
create policy "clubs_update" on clubs
  for update to authenticated
  using ((select gbm_can_manage_portfolio()))
  with check ((select gbm_can_manage_portfolio()));
drop policy if exists "clubs_delete" on clubs;
create policy "clubs_delete" on clubs
  for delete to authenticated
  using ((select gbm_can_manage_portfolio()));

-- ============================================================================
-- PART D — the guard
-- ----------------------------------------------------------------------------
-- Fails the migration if any policy in `public` still calls a role helper or
-- auth.uid() outside a subquery. A wrapped call renders as
-- `( SELECT gbm_is_member() AS gbm_is_member)`, so comparing total occurrences
-- against `SELECT`-prefixed occurrences catches a bare one anywhere in the
-- expression — including inside an EXISTS clause.
--
-- This is what stops the regression coming back. The cost of a bare call is
-- invisible in every local test: correct results, correct permissions, and a
-- table small enough that nobody notices until production has 7,835 rows.
-- ============================================================================
do $$
declare
  bad text;
  fns constant text :=
    'gbm_is_member|gbm_can_write|gbm_can_manage_portfolio|'
    || 'gbm_can_view_guardian_data|gbm_current_user_role|auth\.uid';
begin
  select string_agg(format('%s.%I', tablename, policyname), '; ' order by tablename, policyname)
    into bad
  from pg_policies
  where schemaname = 'public'
    and regexp_count(concat_ws(' ', qual, with_check), '(' || fns || ')\(\)')
      > regexp_count(concat_ws(' ', qual, with_check), 'SELECT (' || fns || ')\(\)');

  if bad is not null then
    raise exception
      'RLS policies still evaluate a role lookup once per row: %. Wrap the call as (select fn()) so Postgres hoists it to an InitPlan.',
      bad;
  end if;
end $$;
