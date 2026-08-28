-- ============================================================================
-- GBM INTELLIGENCE — 0044 THE AGENT PATH GETS THE SAME LOCKS AS EVERYTHING ELSE
-- ----------------------------------------------------------------------------
-- A parallel session built a Transfermarkt/SofaScore ingestion path directly
-- against production: sixteen migrations, twenty objects, no repo file for any
-- of them. The data it produced is good. The access control around it was
-- never brought up to what the rest of this schema does, and because none of
-- it was ever committed, no review ever looked at it.
--
-- What the linter and a read of the catalog found:
--
--   1. NINE SECURITY DEFINER FUNCTIONS WITH NO AUTHORISATION CHECK, GRANTED
--      TO `anon`. `anon` is the unauthenticated role, and its key ships in
--      the browser bundle by design. So any visitor could call:
--
--        gbm_merge_player(p_dup, p_keep)     -- merges and deletes a player
--        gbm_merge_club(p_dup, p_keep)       -- the same for clubs
--        ingest_sofascore_batch(p_batch)     -- writes
--        ingest_tm_agent_batch(p_batch)      -- writes representation records
--        ingest_tm_profile_batch(p_batch)    -- writes profiles
--        claude_write_reports(...)           -- writes intel reports
--        claude_compute_percentiles(...)     -- rewrites 33,670 rows
--        claude_flag_tm_club_mismatch(...)   -- writes
--        claude_invalidate_bad_tm_matches(...) -- writes
--
--      Two of these take only scalar arguments and need no identifiers at
--      all, so they were callable by anyone who could reach the project URL.
--      They are driven from privileged SQL, not from the API, so EXECUTE is
--      revoked outright — the smallest change that closes the surface, and it
--      leaves the pipeline that actually uses them untouched.
--
--      The revoke names PUBLIC first. Postgres grants EXECUTE to PUBLIC by
--      default on every new function, and `anon` and `authenticated` hold
--      their access through that grant rather than through one of their own,
--      so revoking from the two roles alone changes nothing at all. The
--      first attempt at this migration did exactly that and its own guard
--      rejected it.
--
--   2. `sofascore_tournaments` HAD RLS DISABLED, granted to `anon`. Every
--      other table in this schema carries `members can read`; this one was
--      world-readable and world-writable. It gets the same policy as
--      `competitions`.
--
--   3. `v_claude_candidates` WAS A SECURITY DEFINER VIEW, so it evaluated
--      RLS as its creator rather than as the reader. Migration
--      `views_security_invoker` established the opposite rule for every
--      other view in this database.
--
--   4. THIRTEEN FUNCTIONS HAD A MUTABLE search_path. On a SECURITY DEFINER
--      function that is the standard privilege-escalation shape: the caller
--      chooses which schema the function's own table references resolve in.
--      `claude_tm_queue` authenticates against `claude_agent_secrets` by
--      name, so an attacker who could shadow that table would satisfy the
--      token check with a table of their own. Pinned with ALTER FUNCTION
--      rather than by rewriting the bodies — the definitions are long and
--      correct, and retyping them to change one setting is how a working
--      function acquires a typo.
--
--   5. THE AGENT TOKEN WAS STORED IN PLAINTEXT and `claude_agent_secrets`
--      was granted to `anon` and `authenticated`. RLS-with-no-policies was
--      the only thing denying them, which is one permissive policy away from
--      handing out a live credential. The grants are revoked and the secret
--      is replaced by its SHA-256 hash.
--
--      The external caller's token does not change and no coordination is
--      needed: it keeps sending the same string, and the function now hashes
--      what it is given before comparing. A read of this table no longer
--      yields anything usable.
--
-- WHAT IS DELIBERATELY LEFT ALONE
--
-- `staging_ingest` keeps its `staging_ingest_anon_insert` policy. An
-- unauthenticated INSERT restricted to three known source values is a
-- drop-box, and it appears to be how the external scraper delivers. It is
-- INSERT-only — anon cannot read back, update or delete — so the exposure is
-- bounded to writing rows that a privileged batch step then validates. It is
-- flagged rather than removed, because removing it would break a running
-- collection with no warning, and that call belongs to GBM.
--
-- `claude_tm_queue` keeps its `anon` EXECUTE, because the token *is* its
-- authentication and revoking it would break the external caller. With the
-- search_path pinned and the secret hashed, the two things that made that
-- token check weak are gone.
--
-- No function body is rewritten here except `claude_tm_queue`, and that one
-- only to compare a hash instead of a plaintext string.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Nine unguarded SECURITY DEFINER functions leave the API surface
-- ----------------------------------------------------------------------------
revoke execute on function claude_write_reports(numeric, integer, numeric) from public, anon, authenticated;
revoke execute on function claude_compute_percentiles(integer) from public, anon, authenticated;
revoke execute on function claude_flag_tm_club_mismatch(text) from public, anon, authenticated;
revoke execute on function claude_invalidate_bad_tm_matches(text) from public, anon, authenticated;
revoke execute on function ingest_sofascore_batch(text) from public, anon, authenticated;
revoke execute on function ingest_tm_agent_batch(text) from public, anon, authenticated;
revoke execute on function ingest_tm_profile_batch(text) from public, anon, authenticated;
revoke execute on function gbm_merge_player(uuid, uuid) from public, anon, authenticated;
revoke execute on function gbm_merge_club(uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. sofascore_tournaments joins the rest of the schema
-- ----------------------------------------------------------------------------
alter table sofascore_tournaments enable row level security;

drop policy if exists "members can read" on sofascore_tournaments;
create policy "members can read" on sofascore_tournaments
  for select to authenticated
  using ((select gbm_is_member()));

revoke all on table sofascore_tournaments from public, anon;
grant select on table sofascore_tournaments to authenticated;

-- ----------------------------------------------------------------------------
-- 3. The view is read as the reader, not as its creator
-- ----------------------------------------------------------------------------
-- `= on` rather than `= true`: Postgres stores the literal it is given, and
-- every other view in this schema reads `security_invoker=on`. Matching them
-- keeps a catalog sweep for the odd one out a single comparison.
alter view v_claude_candidates set (security_invoker = on);

-- ----------------------------------------------------------------------------
-- 4. Pin every mutable search_path
-- ----------------------------------------------------------------------------
alter function claude_compute_percentiles(integer)             set search_path to 'public';
alter function claude_flag_tm_club_mismatch(text)              set search_path to 'public';
alter function claude_invalidate_bad_tm_matches(text)          set search_path to 'public';
alter function claude_tm_queue(text, integer)                  set search_path to 'public';
alter function claude_write_reports(numeric, integer, numeric) set search_path to 'public';
alter function gbm_find_club(text, uuid)                       set search_path to 'public';
alter function gbm_merge_club(uuid, uuid)                      set search_path to 'public';
alter function gbm_merge_player(uuid, uuid)                    set search_path to 'public';
alter function gbm_norm(text)                                  set search_path to 'public';
alter function gbm_parse_tm_value(text)                        set search_path to 'public';
alter function ingest_sofascore_batch(text)                    set search_path to 'public';
alter function ingest_tm_agent_batch(text)                     set search_path to 'public';
alter function ingest_tm_profile_batch(text)                   set search_path to 'public';

-- ----------------------------------------------------------------------------
-- 5. The token stops being readable
-- ----------------------------------------------------------------------------
revoke all on table claude_agent_secrets from public, anon, authenticated;

-- A 64-character hex string is already a hash; the length test makes this
-- migration safe to run twice rather than hashing the hash.
update claude_agent_secrets
   set secret = encode(extensions.digest(secret, 'sha256'), 'hex')
 where secret !~ '^[0-9a-f]{64}$';

-- The only body rewritten here. Identical to the installed definition except
-- for the comparison, which now hashes the supplied token, and the errcode,
-- which makes a rejected token an authentication failure rather than an
-- anonymous P0001.
create or replace function claude_tm_queue(p_token text, p_limit integer default 400)
returns table(player_id uuid, full_name text, dob date, club text, nat text, has_tm boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from claude_agent_secrets
     where name = 'tm_queue'
       and secret = encode(extensions.digest(p_token, 'sha256'), 'hex')
  ) then
    raise exception 'bad token' using errcode = '28000';
  end if;

  return query
  with c as (
    select v.player_id, max(v.claude_score) sc from v_claude_candidates v
    where v.age<=23.99 and (v.minutes>=300 or (v.minutes is null and v.apps>=4))
    group by v.player_id
  )
  select p.id, p.full_name, p.date_of_birth, cl.name, co.iso3,
         exists(select 1 from player_external_ids e where e.player_id=p.id and e.provider_code='TRANSFERMARKT')
  from c join players p on p.id=c.player_id
  left join clubs cl on cl.id=p.current_club_id
  left join countries co on co.id=p.nationality_country_id
  where not exists (select 1 from representation_records rr
                     where rr.player_id=p.id and rr.is_current
                       and rr.retrieved_at > now()-interval '30 days')
  order by c.sc desc limit p_limit;
end $function$;

comment on table claude_agent_secrets is
  'Shared secrets for token-authenticated agent RPCs. Stores the SHA-256 hex digest, never the token: the caller sends the token and the function hashes it before comparing. No grants to anon or authenticated — reachable only through SECURITY DEFINER functions.';

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
do $$
declare v_bad text;
begin
  -- Every SECURITY DEFINER function in public pins its search_path.
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
        where cfg like 'search\_path=%'
     );
  if v_bad is not null then
    raise exception 'security definer functions still carry a mutable search_path: %', v_bad;
  end if;

  -- No unauthenticated route into the unguarded writers.
  select string_agg(distinct routine_name, ', ') into v_bad
    from information_schema.routine_privileges
   where specific_schema = 'public'
     and grantee in ('anon', 'authenticated', 'PUBLIC')
     and routine_name in ('claude_write_reports','claude_compute_percentiles',
                          'claude_flag_tm_club_mismatch','claude_invalidate_bad_tm_matches',
                          'ingest_sofascore_batch','ingest_tm_agent_batch',
                          'ingest_tm_profile_batch','gbm_merge_player','gbm_merge_club');
  if v_bad is not null then
    raise exception 'unguarded write functions are still executable from the API: %', v_bad;
  end if;

  -- Every base table in public has RLS on.
  select string_agg(c.relname, ', ') into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_bad is not null then
    raise exception 'tables in public have row level security disabled: %', v_bad;
  end if;

  -- No view in public runs as its creator.
  select string_agg(c.relname, ', ') into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     -- A boolean reloption keeps whichever spelling it was set with, so all
     -- of Postgres's accepted forms count as on. Comparing only against
     -- 'true' reports every correctly-configured view as a fault.
     and not coalesce((select option_value in ('on','true','yes','1')
                         from pg_options_to_table(c.reloptions)
                        where option_name = 'security_invoker'), false);
  if v_bad is not null then
    raise exception 'views in public still run as their creator: %', v_bad;
  end if;

  -- The stored secret is a digest, and nothing outside a definer function can
  -- read the table it sits in.
  if exists (select 1 from claude_agent_secrets where secret !~ '^[0-9a-f]{64}$') then
    raise exception 'a secret is still stored in a form that is not a sha-256 digest';
  end if;

  select string_agg(distinct grantee, ', ') into v_bad
    from information_schema.role_table_grants
   where table_name = 'claude_agent_secrets' and grantee in ('anon','authenticated','PUBLIC');
  if v_bad is not null then
    raise exception 'claude_agent_secrets is still granted to: %', v_bad;
  end if;
end $$;
