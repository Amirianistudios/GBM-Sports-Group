-- ============================================================================
-- GBM INTELLIGENCE — 0005a SECURITY HARDENING
-- ----------------------------------------------------------------------------
-- Captured from the hosted project, where it had been applied directly and
-- never written to a migration file. Recorded here so a rebuilt database is
-- hardened the same way rather than silently more permissive.
-- ============================================================================

-- The conflicts view must enforce the QUERYING user's RLS, not the creator's.
-- Without this it silently bypasses the "members can read" policy on source_facts.
alter view player_fact_conflicts set (security_invoker = on);

-- Pin search_path on the helper functions so they cannot be hijacked by a
-- caller-controlled search_path. extensions.unaccent is already fully qualified.
alter function gbm_normalize_name(text)   set search_path = '';
alter function gbm_touch_updated_at()     set search_path = '';

-- These three are SECURITY DEFINER by necessity: RLS policies call them and a
-- SECURITY INVOKER version would recurse into organization_members' own policy.
-- They must not be callable by anonymous users over the REST API.
revoke execute on function gbm_is_member()          from anon, public;
revoke execute on function gbm_can_write()          from anon, public;
revoke execute on function gbm_current_user_role()  from anon, public;
grant  execute on function gbm_is_member()          to authenticated;
grant  execute on function gbm_can_write()          to authenticated;
grant  execute on function gbm_current_user_role()  to authenticated;

-- Trigger-only function: nobody should be able to invoke it over the API.
revoke execute on function gbm_handle_new_user() from anon, authenticated, public;
