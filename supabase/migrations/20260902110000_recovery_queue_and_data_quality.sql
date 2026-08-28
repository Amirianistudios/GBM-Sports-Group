-- ============================================================================
-- GBM INTELLIGENCE — 0047 A RECOVERY QUEUE, AND CHECKS THAT RUN THEMSELVES
-- ----------------------------------------------------------------------------
-- Two things Phase B needs before it ingests anything else: a way to see what
-- the defective merge cost, and a way to notice the next problem without
-- somebody happening to look.
--
-- THE MERGE RECOVERY QUEUE
--
-- `gbm_merge_player` bulk-deleted the duplicate's rows on any unique-key
-- collision, and ran 46 times before it was fixed. It kept no audit, so the
-- lost rows cannot be listed. They can, however, be *inferred*, because the
-- defect leaves a fingerprint: tables whose unique key contains `player_id`
-- were exposed to the delete; tables without one were merely repointed. The
-- 46 survivors against the 7,790 other Transfermarkt-backed players:
--
--                       survivors   others    exposed to the delete?
--     market values          6.6     14.7     yes  (player_id, provider, valued_on)
--     transfers              3.8      6.5     yes  (player_id, provider, date, clubs)
--     season stats           3.3      4.4     yes  (player_id, season, competition, club, provider)
--     contracts              1.7      0.8     no   — and they GAINED
--     representation         1.5      1.0     no   — and they GAINED
--
-- Every collision-prone table is down; every safe table is up. That is the
-- defect's signature rather than a coincidence of thin players, and it is the
-- closest thing to a loss measurement available after the fact.
--
-- The queue is a view, not a table, so it cannot go stale. It lists what each
-- survivor now holds and what it is missing relative to the population, so a
-- targeted re-import can be aimed and then checked.
--
-- Recovery itself is re-ingestion, not repair: market values and transfers
-- come from the Transfermarkt dataset, the import is idempotent, and
-- `source_records` still holds the raw payloads. The scheduled refresh runs
-- `--max-players 2000` in GBM priority order, so these players are not
-- guaranteed to be in it — which is why they need naming.
--
-- THE DATA-QUALITY REPORT
--
-- Eleven checks, one function, returning jsonb so the application and the
-- ingestion workflow can read the same answer. It counts rather than fixes:
-- an automatic repair of something nobody has looked at is how the merge
-- defect destroyed data in the first place.
-- ============================================================================

create or replace view v_merge_recovery_queue
with (security_invoker = on) as
select
  p.id                                   as player_id,
  p.full_name,
  (select e.external_id from player_external_ids e
    where e.player_id = p.id and e.provider_code = 'TRANSFERMARKT' limit 1) as transfermarkt_id,
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
  -- Population means, held as constants so the view stays a view: a survivor
  -- below both is the strongest candidate for re-import.
  ((select count(*) from market_values v where v.player_id = p.id) < 14
   and (select count(*) from transfers t where t.player_id = p.id) < 6)     as likely_lost_rows,
  a.created_at                           as merged_at
from player_aliases a
join players p on p.id = a.player_id
where a.alias_type = 'MERGE';

comment on view v_merge_recovery_queue is
  'The players that survived a merge under the defective gbm_merge_player, with what they now hold. Lost rows cannot be listed — the old function kept no audit — so likely_lost_rows infers from the two tables the cohort comparison shows depleted. Recovery is idempotent re-ingestion, not repair.';

grant select on v_merge_recovery_queue to authenticated;

-- ----------------------------------------------------------------------------
-- Data quality, as one answer both the app and the workflow can read
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
      select count(*) from v_merge_recovery_queue where likely_lost_rows)
  );
$fn$;

comment on function gbm_data_quality_report is
  'Eleven data-quality counts as one jsonb answer, read by both the application and the ingestion workflow. Counts, never repairs: an automatic fix to something nobody has looked at is how the merge defect destroyed data.';

revoke all on function gbm_data_quality_report() from public, anon;
grant execute on function gbm_data_quality_report() to authenticated;

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
do $$
declare v_report jsonb; v_missing text;
begin
  v_report := gbm_data_quality_report();

  -- Every documented check must be present. A renamed or dropped key would
  -- otherwise read as "no problems" on whatever surfaces it.
  select string_agg(k, ', ') into v_missing from unnest(array[
    'duplicate_external_ids','players_sharing_a_provider_id','duplicate_players_name_dob',
    'orphan_source_facts','source_records_unlinked','stats_without_competition',
    'contracts_expiring_in_the_past','market_values_dated_in_the_future',
    'duplicate_current_representation','players_with_club_outside_their_league',
    'cache_name_id_mismatch','unresolved_merge_conflicts','merge_survivors_needing_reingest'
  ]) k where not v_report ? k;
  if v_missing is not null then
    raise exception 'the data quality report is missing checks: %', v_missing;
  end if;

  -- The recovery queue must find the merges that actually happened.
  if (select count(*) from v_merge_recovery_queue) = 0
     and exists (select 1 from player_aliases where alias_type = 'MERGE') then
    raise exception 'v_merge_recovery_queue is empty while MERGE aliases exist';
  end if;
end $$;
