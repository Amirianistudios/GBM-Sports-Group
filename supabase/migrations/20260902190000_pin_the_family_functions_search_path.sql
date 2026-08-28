-- ============================================================================
-- GBM INTELLIGENCE — 0054 PIN THE FAMILY FUNCTION'S SEARCH PATH
-- ----------------------------------------------------------------------------
-- 0051 created gbm_cohort_family without pinning search_path — the advisor
-- flagged it within the hour. The function is a pure CASE over its argument
-- and touches no relations, so nothing was exploitable, but the platform's
-- standard (set in the 0044 hardening pass) is that every function pins its
-- path; a rule with quiet exceptions stops being a rule. Empty string, not
-- 'public': a function that needs no schema should see none.
-- ============================================================================

alter function gbm_cohort_family(text) set search_path to '';

do $$
begin
  if not exists (
    select 1 from pg_proc p
    where p.proname = 'gbm_cohort_family'
      and p.proconfig::text like '%search_path=%'
  ) then
    raise exception 'gbm_cohort_family still has no pinned search_path';
  end if;
  -- And it still answers.
  if gbm_cohort_family('Centre-Back') is distinct from 'CB' then
    raise exception 'gbm_cohort_family stopped mapping after the alter';
  end if;
end $$;
