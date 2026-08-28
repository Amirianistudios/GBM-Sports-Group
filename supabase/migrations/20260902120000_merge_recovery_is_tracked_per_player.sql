-- ============================================================================
-- GBM INTELLIGENCE — 0048 MERGE RECOVERY IS TRACKED PER PLAYER
-- ----------------------------------------------------------------------------
-- Migration 0047 built the recovery queue; this one makes recovery itself
-- observable. The `recovery:merged-players` command re-imports, from the
-- Transfermarkt dataset, everything the source still holds for each merge
-- survivor — and every attempt lands here, with the coverage the player had
-- before, the coverage they have after, and what the dataset itself carried.
-- The queue then shows a per-player state instead of a permanent flag.
--
-- The states, and what each one honestly means:
--
--   PENDING              no recovery attempt yet (the absence of a row here)
--   RECOVERED            source-complete: GBM now holds at least as many
--                        market values and transfers as the dataset carries
--                        for this id. NOT history-complete — rows the old
--                        merge destroyed that the dataset no longer carries
--                        are gone, and no state claims otherwise.
--   PARTIAL              the import added rows but the dataset still holds
--                        more; something blocked a row and a human should ask
--                        why before the command is simply re-run.
--   NO_SOURCE_AVAILABLE  no Transfermarkt id and no raw payloads: there is
--                        nothing to re-read, from any automated path.
--   MANUAL_REVIEW        automation ends here: the player has only raw
--                        payloads in source_records (a human can re-process
--                        them), or the dataset does not know their id.
--
-- `likely_lost_rows` stays what it always was — an inference against
-- population means, useful for aiming the first pass. It is NOT the recovery
-- success criterion: a 19-year-old with three genuine Transfermarkt
-- valuations will never reach the population mean of 14, and calling that
-- player unrecovered forever would be the same class of dishonesty as
-- calling NO_AGENCY_LISTED "unrepresented".
-- ============================================================================

create table if not exists merge_recovery_attempts (
  id                  uuid primary key default gen_random_uuid(),
  -- Which ingestion run performed the attempt. SET NULL rather than CASCADE:
  -- pruning old run rows must not erase the recovery audit.
  run_id              uuid references ingestion_runs(id) on delete set null,
  player_id           uuid not null references players(id) on delete cascade,
  tm_id               text,
  state               text not null
    check (state in ('RECOVERED', 'PARTIAL', 'NO_SOURCE_AVAILABLE', 'MANUAL_REVIEW')),
  before_coverage     jsonb not null,
  after_coverage      jsonb not null,
  source_availability jsonb,
  attempted_at        timestamptz not null default now()
);

comment on table merge_recovery_attempts is
  'One row per player per run of recovery:merged-players. before/after_coverage are the queue view''s counts at attempt time; source_availability is what the Transfermarkt dataset held. RECOVERED means source-complete, never history-complete: the defective merge kept no audit, so what it destroyed beyond the source''s current horizon is unrecoverable and no state claims otherwise.';

-- The queue view resolves each player's latest attempt through this.
create index if not exists merge_recovery_attempts_player_latest_idx
  on merge_recovery_attempts (player_id, attempted_at desc);

alter table merge_recovery_attempts enable row level security;

drop policy if exists "members can read" on merge_recovery_attempts;
create policy "members can read" on merge_recovery_attempts
  for select to authenticated using ((select gbm_is_member()));

-- Writes come only from the service role (the CLI in CI), which bypasses RLS.
-- No insert/update/delete policies on purpose.
revoke all on table merge_recovery_attempts from public, anon, authenticated;
grant select on table merge_recovery_attempts to authenticated;

-- ----------------------------------------------------------------------------
-- The queue now carries a state, and finds every anchor.
--
-- Two changes against 0047, both additive in shape:
--   1. transfermarkt_id now prefers the TRANSFERMARKT_DATASET code and falls
--      back to TRANSFERMARKT. Five survivors hold only the dataset code; the
--      old single-code lookup showed them as unanchored when they are the
--      most recoverable players in the queue.
--   2. recovery_state / last_attempted_at from the latest attempt, PENDING
--      when none exists.
-- ----------------------------------------------------------------------------
create or replace view v_merge_recovery_queue
with (security_invoker = on) as
select
  p.id                                   as player_id,
  p.full_name,
  coalesce(
    (select e.external_id from player_external_ids e
      where e.player_id = p.id and e.provider_code = 'TRANSFERMARKT_DATASET' limit 1),
    (select e.external_id from player_external_ids e
      where e.player_id = p.id and e.provider_code = 'TRANSFERMARKT' limit 1)) as transfermarkt_id,
  (select count(*) from player_season_stats s where s.player_id = p.id)     as season_stats,
  (select count(*) from market_values v where v.player_id = p.id)           as market_values,
  (select count(*) from transfers t where t.player_id = p.id)               as transfers,
  (select count(*) from contracts c where c.player_id = p.id)               as contracts,
  (select count(*) from representation_records r where r.player_id = p.id)  as representation,
  (select count(*) from player_external_ids e where e.player_id = p.id)     as external_ids,
  (select count(*) from source_records sr where sr.player_id = p.id)        as raw_payloads,
  (select count(*) from source_facts f
    where f.entity_type = 'PLAYER' and f.entity_id = p.id)                  as source_facts,
  -- The two collision-prone tables the cohort comparison shows as depleted.
  -- Population means, held as constants so the view stays a view: an aiming
  -- heuristic for the first pass, not the recovery success criterion.
  ((select count(*) from market_values v where v.player_id = p.id) < 14
   and (select count(*) from transfers t where t.player_id = p.id) < 6)     as likely_lost_rows,
  a.created_at                           as merged_at,
  coalesce(att.state, 'PENDING')         as recovery_state,
  att.attempted_at                       as last_attempted_at
from player_aliases a
join players p on p.id = a.player_id
left join lateral (
  select m.state, m.attempted_at
    from merge_recovery_attempts m
   where m.player_id = p.id
   order by m.attempted_at desc
   limit 1
) att on true
where a.alias_type = 'MERGE';

comment on view v_merge_recovery_queue is
  'The players that survived a merge under the defective gbm_merge_player, with what they now hold and how far recovery has got. Lost rows cannot be listed — the old function kept no audit — so likely_lost_rows infers from the two tables the cohort comparison shows depleted, and recovery_state records what re-ingestion achieved: RECOVERED is source-complete against the Transfermarkt dataset, never history-complete.';

grant select on v_merge_recovery_queue to authenticated;

-- ----------------------------------------------------------------------------
-- The quality report learns the difference between "not yet recovered" and
-- "recovery needs a human". merge_survivors_needing_reingest becomes the
-- automatable remainder (PENDING or PARTIAL); MANUAL_REVIEW gets its own key
-- so it lands on a person's desk instead of hiding inside a shrinking count.
-- ----------------------------------------------------------------------------
create or replace function gbm_data_quality_report()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $fn$
  select jsonb_build_object(
    'generated_at', now(),

    -- Identity ------------------------------------------------------------
    'duplicate_external_ids', (
      select count(*) from (
        select provider_code, namespace, external_id
          from player_external_ids
         group by 1,2,3 having count(distinct player_id) > 1) d),
    'players_sharing_a_provider_id', (
      select count(*) from (
        select player_id, provider_code
          from player_external_ids
         group by 1,2 having count(distinct external_id) > 1) d),
    'duplicate_players_name_dob', (
      select count(*) from (
        select normalized_name, date_of_birth
          from players where date_of_birth is not null
         group by 1,2 having count(*) > 1) d),

    -- Provenance ----------------------------------------------------------
    'orphan_source_facts', (
      select count(*) from source_facts f
       where f.entity_type = 'PLAYER'
         and not exists (select 1 from players p where p.id = f.entity_id)),
    'source_records_unlinked', (
      select count(*) from source_records where player_id is null),

    -- Football sanity -----------------------------------------------------
    'stats_without_competition', (
      select count(*) from player_season_stats where competition_id is null),
    'contracts_expiring_in_the_past', (
      select count(*) from contracts
       where expires_on is not null and expires_on < current_date - interval '2 years'
         and status = 'ACTIVE'),
    'market_values_dated_in_the_future', (
      select count(*) from market_values where valued_on > current_date + 1),
    'duplicate_current_representation', (
      select count(*) from (
        select player_id from representation_records
         where is_current group by player_id having count(*) > 1) d),
    'players_with_club_outside_their_league', (
      select count(*) from players p
       join clubs c on c.id = p.current_club_id
       join competitions comp on comp.id = p.cached_competition_id
       where c.country_id is not null and comp.country_id is not null
         and c.country_id <> comp.country_id),

    -- Caches --------------------------------------------------------------
    'cache_name_id_mismatch', (
      select count(*) from players p
       left join competitions c on c.id = p.cached_competition_id
       where p.cached_league is not null
         and (p.cached_competition_id is null or c.name is distinct from p.cached_league)),

    -- The queue that must not grow silently -------------------------------
    'unresolved_merge_conflicts', (
      select count(*) from player_merge_conflicts where reviewed_at is null),
    'merge_survivors_needing_reingest', (
      select count(*) from v_merge_recovery_queue
       where recovery_state in ('PENDING', 'PARTIAL')),
    'merge_recovery_manual_review', (
      select count(*) from v_merge_recovery_queue
       where recovery_state = 'MANUAL_REVIEW')
  );
$fn$;

comment on function gbm_data_quality_report is
  'Fourteen data-quality counts as one jsonb answer, read by both the application and the ingestion workflow. Counts, never repairs: an automatic fix to something nobody has looked at is how the merge defect destroyed data.';

revoke all on function gbm_data_quality_report() from public, anon;
grant execute on function gbm_data_quality_report() to authenticated;

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
do $$
declare v_report jsonb; v_missing text; v_bad int;
begin
  v_report := gbm_data_quality_report();

  -- Every documented check must be present, the two recovery keys included.
  select string_agg(k, ', ') into v_missing from unnest(array[
    'duplicate_external_ids','players_sharing_a_provider_id','duplicate_players_name_dob',
    'orphan_source_facts','source_records_unlinked','stats_without_competition',
    'contracts_expiring_in_the_past','market_values_dated_in_the_future',
    'duplicate_current_representation','players_with_club_outside_their_league',
    'cache_name_id_mismatch','unresolved_merge_conflicts',
    'merge_survivors_needing_reingest','merge_recovery_manual_review'
  ]) k where not v_report ? k;
  if v_missing is not null then
    raise exception 'the data quality report is missing checks: %', v_missing;
  end if;

  -- Every queue row must carry a defined state. At apply time, before any
  -- attempt exists, that is PENDING for all of them — never null, never a
  -- value outside the vocabulary the application renders.
  select count(*) into v_bad from v_merge_recovery_queue
   where recovery_state not in
     ('PENDING', 'RECOVERED', 'PARTIAL', 'NO_SOURCE_AVAILABLE', 'MANUAL_REVIEW');
  if v_bad > 0 then
    raise exception '% queue rows carry an undefined recovery_state', v_bad;
  end if;

  -- The dual-code anchor lookup must find at least as many anchors as the
  -- old single-code lookup did. On live data it finds five more.
  if exists (
    select 1 from v_merge_recovery_queue q
     where q.transfermarkt_id is null
       and exists (select 1 from player_external_ids e
                    where e.player_id = q.player_id
                      and e.provider_code in ('TRANSFERMARKT', 'TRANSFERMARKT_DATASET'))
  ) then
    raise exception 'a survivor with a Transfermarkt id shows as unanchored in the queue';
  end if;
end $$;
