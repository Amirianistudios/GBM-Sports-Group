-- ============================================================================
-- GBM INTELLIGENCE — 0008 CLOSE THE ANONYMOUS READ PATH
-- ----------------------------------------------------------------------------
-- Two holes, both found by querying the database as `anon` rather than by
-- reading the code.
--
-- 1. The five v_* intelligence views were created without security_invoker, so
--    they executed with the view owner's privileges and bypassed row-level
--    security. Combined with the default SELECT grant to `anon`, a request
--    carrying only the public anon key — which ships in the browser bundle —
--    returned the entire scouting database from
--    /rest/v1/v_representation_opportunities: names, dates of birth,
--    valuations, contract expiries and agency status. Verified as anon: 30 rows
--    before, permission denied after.
--
--    `player_fact_conflicts` had already been fixed this way; these were missed.
--    GBM Intelligence has no public surface, and that must hold at the database
--    boundary, not only in the application's routing.
--
-- 2. The two ingestion functions added alongside the pipeline are SECURITY
--    DEFINER and mutate data, and the default EXECUTE-to-PUBLIC grant left them
--    reachable anonymously through /rpc/. gbm_compute_discovery_signals()
--    deletes and rewrites the whole signal set, so this was a data-destruction
--    vector open to the internet.
-- ============================================================================

alter view v_player_current_value         set (security_invoker = on);
alter view v_player_representation        set (security_invoker = on);
alter view v_player_source_coverage       set (security_invoker = on);
alter view v_player_value_trend           set (security_invoker = on);
alter view v_representation_opportunities set (security_invoker = on);

revoke select on v_player_current_value         from anon;
revoke select on v_player_representation        from anon;
revoke select on v_player_source_coverage       from anon;
revoke select on v_player_value_trend           from anon;
revoke select on v_representation_opportunities from anon;
revoke select on player_fact_conflicts          from anon;

-- Ingestion operations: run by the CLI and CI with the service role, never by a
-- browser session, so no application role needs them.
revoke execute on function gbm_compute_discovery_signals()       from public, anon, authenticated;
revoke execute on function gbm_recompute_data_confidence(uuid[]) from public, anon, authenticated;
grant  execute on function gbm_compute_discovery_signals()       to service_role;
grant  execute on function gbm_recompute_data_confidence(uuid[]) to service_role;
