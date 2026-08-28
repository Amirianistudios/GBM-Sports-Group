-- ============================================================================
-- GBM INTELLIGENCE — 0045 A MERGE MUST NOT DESTROY WHAT IT IS MERGING
-- ----------------------------------------------------------------------------
-- `gbm_merge_player` walked every foreign key pointing at `players.id`,
-- repointed the duplicate's rows at the survivor, and handled a collision like
-- this:
--
--     exception when unique_violation then
--       execute format('delete from %I where %I=$1', tbl, col) using p_dup;
--
-- That DELETE has no key predicate. One colliding row does not delete one row
-- — it deletes *every* row the duplicate owned in that table. Measured on two
-- synthetic players, in a transaction that was rolled back:
--
--     survivor            1 season-stat row
--     duplicate           3 season-stat rows, exactly ONE of which collided
--     after the merge     1 row.  Three rows gone, two of which had no
--                         conflict with anything.
--
-- Entity resolution is a core GBM operation and `player_season_stats` holds
-- 40,326 rows, so this is the difference between deduplicating a population
-- and quietly shredding it.
--
-- WHICH TABLES COULD ACTUALLY COLLIDE
--
-- Thirty-three foreign keys point at `players.id`. A repoint can only collide
-- where a unique key contains `player_id`, and half of those keys are unique
-- *indexes* rather than constraints, so a survey of `pg_constraint` alone —
-- the obvious thing to check — misses the worst of them:
--
--     player_season_stats  (player_id, season_id, competition_id, club_id,
--                           provider_code) NULLS NOT DISTINCT      <- index
--     contracts            two unique indexes, one an expression
--     transfers            two unique indexes, one an expression
--     representation_records  (player_id, provider_code) WHERE is_current
--     player_injuries, player_team_history                        <- indexes
--     market_values, player_percentiles, player_news, player_links,
--     player_match_stats, player_rankings, player_tags, discovery_signals,
--     scout_player_ratings, watchlist_players, player_evaluations,
--     recruitment_matches                                    <- constraints
--     gbm_portfolio, player_live_status   player_id IS the primary key
--
-- Twenty tables in total. The remaining thirteen — `player_external_ids`,
-- `source_records`, `scouting_reports`, `player_notes`, `intel_reports` and
-- the rest — carry no unique key over `player_id`, so their rows always move.
--
-- HOW THIS VERSION WORKS
--
-- It does not try to predict collisions. Predicting them means parsing every
-- unique index including partial ones and expression ones like
-- `COALESCE(transfer_date, '1900-01-01')`, and a merge that is subtly wrong
-- about which rows conflict is how the original defect happened.
--
-- Instead each row is moved individually, and a row that cannot move is
-- **archived verbatim before it is removed**:
--
--     1. try to repoint one row at the survivor
--     2. on unique_violation, capture the blocking constraint's name and the
--        whole row as jsonb into `player_merge_conflicts`, then delete only
--        that row
--     3. repeat until the duplicate owns no more rows in that table
--
-- A collision means the survivor already holds a row with the same natural key
-- — the same fact, from the same provider, for the same season. The duplicate's
-- copy is redundant, but redundant is not the same as worthless, so it is kept
-- where a person can read it rather than dropped. Nothing is lost, and every
-- conflict is queued for review instead of being silently resolved.
--
-- Each row moves inside its own subtransaction, so one collision cannot
-- abort the merge, and the merge as a whole is a single statement: it either
-- completes or it rolls back. There are no partial merges.
--
-- THINGS HANDLED SPECIFICALLY, BECAUSE GENERIC IS WRONG FOR THEM
--
-- `representation_records` has a partial unique index over
-- (player_id, provider_code) WHERE is_current. Left to the generic path, the
-- duplicate's current record would collide and be archived away. Since
-- representation history is exactly what GBM is in business to know, the
-- duplicate's record is demoted to `is_current = false` first, so BOTH rows
-- survive the merge and the history stays intact.
--
-- The survivor's own `players` row is filled from the duplicate column by
-- column, so a date of birth, a nationality or a photograph the duplicate had
-- and the survivor lacked is gained rather than discarded.
--
-- `source_facts` is reached through (entity_type, entity_id) and has no foreign
-- key at all, so a loop driven by the catalog cannot see it. It is the table
-- recording which provider asserted which value, and its unique key includes
-- entity_id — so it both matters most and can collide. It is named explicitly.
--
-- `player_external_ids` moves wholesale, which is how provider ids combine.
-- If that leaves the survivor holding two different ids for one provider, one
-- of them is wrong — the merge records it as a conflict for review rather than
-- guessing which.
--
-- GUARDS
--
--   · a player cannot be merged into itself, and neither id may be null
--   · both players must exist
--   · merging a GBM portfolio player *into* a non-portfolio player is refused
--     as a probable reversal of the arguments — the one mistake whose damage
--     is hardest to see afterwards. `p_force` overrides it deliberately.
--   · a pair-scoped advisory lock, so two concurrent merges cannot interleave
--   · re-running a completed merge is a no-op that returns the original
--     report rather than raising
--
-- The duplicate's entire `players` row is snapshotted into `player_merges`
-- before deletion, so the merge can be understood — and, if it was wrong,
-- reconstructed — after the fact.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Where a merge is recorded
-- ----------------------------------------------------------------------------
-- No foreign keys on purpose. An audit row has to outlive the rows it
-- describes, and `duplicate_id` names a player this function is about to
-- delete.
create table if not exists player_merges (
  id uuid primary key default gen_random_uuid(),
  survivor_id uuid not null,
  duplicate_id uuid not null,
  duplicate_snapshot jsonb not null,
  report jsonb not null default '{}'::jsonb,
  merged_by uuid,
  merged_at timestamptz not null default now()
);

create index if not exists player_merges_survivor_idx on player_merges (survivor_id);
create unique index if not exists player_merges_duplicate_idx on player_merges (duplicate_id);

comment on table player_merges is
  'One row per completed player merge, holding the duplicate''s full players row as jsonb. Carries no foreign keys: it must outlive the player it describes.';

create table if not exists player_merge_conflicts (
  id uuid primary key default gen_random_uuid(),
  merge_id uuid not null references player_merges(id) on delete cascade,
  table_name text not null,
  constraint_name text,
  payload jsonb not null,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists player_merge_conflicts_merge_idx on player_merge_conflicts (merge_id);
create index if not exists player_merge_conflicts_open_idx
  on player_merge_conflicts (created_at desc) where reviewed_at is null;

comment on table player_merge_conflicts is
  'A child row that could not be repointed at the survivor because the survivor already held a row with the same natural key. The whole row is kept as jsonb for review rather than dropped.';

alter table player_merges           enable row level security;
alter table player_merge_conflicts  enable row level security;

drop policy if exists "members can read" on player_merges;
create policy "members can read" on player_merges
  for select to authenticated using ((select gbm_is_member()));

drop policy if exists "members can read" on player_merge_conflicts;
create policy "members can read" on player_merge_conflicts
  for select to authenticated using ((select gbm_is_member()));

revoke all on table player_merges          from public, anon, authenticated;
revoke all on table player_merge_conflicts from public, anon, authenticated;
grant select on table player_merges          to authenticated;
grant select on table player_merge_conflicts to authenticated;

-- ----------------------------------------------------------------------------
-- The merge
-- ----------------------------------------------------------------------------
-- The old signature returned integer and cannot be replaced in place.
drop function if exists gbm_merge_player(uuid, uuid);

create or replace function gbm_merge_player(
  p_dup uuid,
  p_keep uuid,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $fn$
declare
  r            record;
  v_ctid       tid;
  v_payload    jsonb;
  v_constraint text;
  v_moved      int;
  v_archived   int;
  v_tables     jsonb := '{}'::jsonb;
  v_total_moved int := 0;
  v_total_archived int := 0;
  v_snapshot   jsonb;
  v_merge_id   uuid;
  v_name       text;
  v_report     jsonb;
  v_dup_portfolio boolean;
  v_keep_portfolio boolean;
  v_id_conflicts int := 0;
begin
  -- ---- guards -------------------------------------------------------------
  if p_dup is null or p_keep is null then
    raise exception 'MERGE_NULL_ARGUMENT' using errcode = '22004';
  end if;
  if p_dup = p_keep then
    raise exception 'MERGE_INTO_SELF %', p_dup using errcode = '22023';
  end if;

  -- Idempotency: a completed merge replays as its own report.
  select report into v_report from player_merges where duplicate_id = p_dup;
  if found then
    return v_report || jsonb_build_object('already_merged', true);
  end if;

  -- Serialise merges touching either player.
  perform pg_advisory_xact_lock(hashtextextended(p_keep::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_dup::text, 0));

  select to_jsonb(p.*) into v_snapshot from players p where p.id = p_dup;
  if v_snapshot is null then
    raise exception 'MERGE_UNKNOWN_DUPLICATE %', p_dup using errcode = '22023';
  end if;
  if not exists (select 1 from players where id = p_keep) then
    raise exception 'MERGE_UNKNOWN_SURVIVOR %', p_keep using errcode = '22023';
  end if;

  -- The reversal that is hardest to notice afterwards: the represented player
  -- is the one deleted, and the record GBM actually owns is the one that goes.
  select exists (select 1 from gbm_portfolio where player_id = p_dup),
         exists (select 1 from gbm_portfolio where player_id = p_keep)
    into v_dup_portfolio, v_keep_portfolio;
  if v_dup_portfolio and not v_keep_portfolio and not p_force then
    raise exception
      'MERGE_LIKELY_REVERSED: % is in the GBM portfolio and % is not; pass p_force => true if this is deliberate',
      p_dup, p_keep using errcode = '22023';
  end if;

  insert into player_merges (survivor_id, duplicate_id, duplicate_snapshot, merged_by)
  values (p_keep, p_dup, v_snapshot, auth.uid())
  returning id into v_merge_id;

  -- ---- the survivor gains what only the duplicate had ----------------------
  update players k set
    date_of_birth              = coalesce(k.date_of_birth, d.date_of_birth),
    nationality_country_id     = coalesce(k.nationality_country_id, d.nationality_country_id),
    second_nationality_country_id = coalesce(k.second_nationality_country_id, d.second_nationality_country_id),
    birth_country_id           = coalesce(k.birth_country_id, d.birth_country_id),
    birth_place                = coalesce(k.birth_place, d.birth_place),
    height_cm                  = coalesce(k.height_cm, d.height_cm),
    weight_kg                  = coalesce(k.weight_kg, d.weight_kg),
    foot                       = case when k.foot is null or k.foot = 'UNKNOWN' then d.foot else k.foot end,
    primary_position           = coalesce(k.primary_position, d.primary_position),
    secondary_positions        = case when coalesce(array_length(k.secondary_positions, 1), 0) = 0
                                      then d.secondary_positions else k.secondary_positions end,
    shirt_number               = coalesce(k.shirt_number, d.shirt_number),
    current_club_id            = coalesce(k.current_club_id, d.current_club_id),
    image_url                  = coalesce(k.image_url, d.image_url),
    image_credit               = coalesce(k.image_credit, d.image_credit),
    gbm_portrait_url           = coalesce(k.gbm_portrait_url, d.gbm_portrait_url),
    gbm_hero_image_url         = coalesce(k.gbm_hero_image_url, d.gbm_hero_image_url),
    is_goalkeeper              = coalesce(k.is_goalkeeper, d.is_goalkeeper),
    data_confidence            = greatest(coalesce(k.data_confidence, 0), coalesce(d.data_confidence, 0)),
    last_enriched_at           = greatest(k.last_enriched_at, d.last_enriched_at),
    updated_at                 = now()
  from players d
  where k.id = p_keep and d.id = p_dup;

  -- ---- representation history survives in full ----------------------------
  -- The partial unique index only bites on is_current. Demoting the
  -- duplicate's current record keeps both rows instead of archiving one.
  update representation_records d
     set is_current = false
   where d.player_id = p_dup
     and d.is_current
     and exists (
       select 1 from representation_records k
        where k.player_id = p_keep and k.is_current
          and k.provider_code is not distinct from d.provider_code
     );

  -- ---- every child row moves, or is archived before it is removed ---------
  for r in
    select distinct tbl, col, pred from (
      select c.conrelid::regclass::text as tbl, a.attname as col, ''::text as pred
        from pg_constraint c
        join unnest(c.conkey) with ordinality k(attnum, ord) on true
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
       where c.contype = 'f' and c.confrelid = 'players'::regclass
      union
      -- `source_facts` reaches a player through (entity_type, entity_id) and
      -- carries no foreign key, so the catalog query above cannot see it. It
      -- is the table that records which provider asserted which value — the
      -- provenance the whole schema is built on — and its unique key includes
      -- entity_id, so it can collide like any other. Left out, every merge
      -- would strand the duplicate's facts on an id that no longer exists.
      select 'source_facts', 'entity_id', ' and entity_type = ''PLAYER'''
    ) d
     order by 1, 2
  loop
    v_moved := 0;
    v_archived := 0;

    loop
      -- One row at a time, re-read each pass: a successful UPDATE rewrites the
      -- tuple, so a list of ctids collected up front goes stale.
      execute format('select ctid from %I where %I = $1 %s limit 1', r.tbl, r.col, r.pred)
        into v_ctid using p_dup;
      exit when v_ctid is null;

      begin
        execute format('update %I set %I = $1 where ctid = $2', r.tbl, r.col)
          using p_keep, v_ctid;
        v_moved := v_moved + 1;
      exception when unique_violation then
        -- The survivor already holds this natural key. Keep the duplicate's
        -- version where someone can read it, then remove just this row.
        get stacked diagnostics v_constraint = constraint_name;
        execute format('select to_jsonb(t) from %I t where ctid = $1', r.tbl)
          into v_payload using v_ctid;
        insert into player_merge_conflicts (merge_id, table_name, constraint_name, payload)
        values (v_merge_id, r.tbl, v_constraint, v_payload);
        execute format('delete from %I where ctid = $1', r.tbl) using v_ctid;
        v_archived := v_archived + 1;
      end;
    end loop;

    if v_moved > 0 or v_archived > 0 then
      v_tables := v_tables || jsonb_build_object(
        r.tbl, jsonb_build_object('reassigned', v_moved, 'archived', v_archived));
      v_total_moved := v_total_moved + v_moved;
      v_total_archived := v_total_archived + v_archived;
    end if;
  end loop;

  -- ---- two provider ids for one provider means one of them is wrong -------
  select count(*) into v_id_conflicts from (
    select provider_code from player_external_ids
     where player_id = p_keep
     group by provider_code having count(distinct external_id) > 1
  ) d;

  -- ---- the duplicate's name stays findable --------------------------------
  v_name := v_snapshot->>'full_name';
  if v_name is not null then
    insert into player_aliases (player_id, alias, alias_type, source_provider)
    select p_keep, v_name, 'MERGE', 'GBM_INTERNAL'
     where not exists (
       select 1 from player_aliases
        where player_id = p_keep and normalized_alias = gbm_normalize_name(v_name));
  end if;

  delete from players where id = p_dup;

  v_report := jsonb_build_object(
    'merge_id',            v_merge_id,
    'survivor_id',         p_keep,
    'duplicate_id',        p_dup,
    'rows_reassigned',     v_total_moved,
    'rows_archived',       v_total_archived,
    'tables',              v_tables,
    'provider_id_conflicts', v_id_conflicts,
    'caches_stale',        true,
    'forced',              p_force);

  update player_merges set report = v_report where id = v_merge_id;
  return v_report;
end $fn$;

comment on function gbm_merge_player(uuid, uuid, boolean) is
  'Merges the duplicate player into the survivor. Every child row is repointed individually; a row blocked by a unique key is archived whole into player_merge_conflicts before removal, never bulk-deleted. Returns a jsonb report. Caches are left stale — follow with gbm_refresh_player_caches().';

revoke all on function gbm_merge_player(uuid, uuid, boolean) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
do $$
declare
  v_src text;
  v_report jsonb;
  v_survivor_rows int;
  v_archived int;
  v_bad text;
begin
  -- The shape of the original defect: a DELETE whose only predicate is the
  -- duplicate's id, used as conflict resolution.
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'gbm_merge_player';
  if v_src ~* 'delete from %I where %I=\$1' then
    raise exception 'gbm_merge_player still bulk-deletes the duplicate''s rows on conflict';
  end if;
  if v_src !~* 'player_merge_conflicts' then
    raise exception 'gbm_merge_player no longer archives conflicting rows';
  end if;

  -- Behavioural proof, on synthetic players, undone before this block ends.
  -- The numbers are the ones the old function got wrong: the duplicate owns
  -- three season-stat rows, exactly one of which collides, and all three are
  -- accounted for afterwards — two moved, one archived.
  --
  -- provider_code is a foreign key into data_providers, so the rehearsal
  -- borrows a real provider rather than inventing one.
  insert into players (id, full_name, short_name, gbm_status) values
    ('dddddddd-0000-4000-8000-0000000dead0','MERGE GUARD Duplicate','Dup','NONE'),
    ('cccccccc-0000-4000-8000-0000000cafe0','MERGE GUARD Survivor','Keep','NONE');

  insert into player_season_stats (player_id, season_id, competition_id, club_id, provider_code, minutes_played)
  select p.pid, (select id from seasons limit 1), (select id from competitions limit 1),
         cl.id, 'SOFASCORE', p.mins
  from (values ('cccccccc-0000-4000-8000-0000000cafe0'::uuid, 900, 1),
               ('dddddddd-0000-4000-8000-0000000dead0'::uuid, 800, 1),
               ('dddddddd-0000-4000-8000-0000000dead0'::uuid, 700, 2),
               ('dddddddd-0000-4000-8000-0000000dead0'::uuid, 600, 3)) p(pid, mins, rnk)
  join (select id, row_number() over (order by id) rn from clubs limit 3) cl on cl.rn = p.rnk;

  v_report := gbm_merge_player('dddddddd-0000-4000-8000-0000000dead0',
                               'cccccccc-0000-4000-8000-0000000cafe0');

  select count(*) into v_survivor_rows from player_season_stats
   where player_id = 'cccccccc-0000-4000-8000-0000000cafe0';
  select count(*) into v_archived from player_merge_conflicts
   where merge_id = (v_report->>'merge_id')::uuid and table_name = 'player_season_stats';

  if v_survivor_rows <> 3 then
    raise exception 'merge lost season stats: survivor holds % rows, expected 3', v_survivor_rows;
  end if;
  if v_archived <> 1 then
    raise exception 'the colliding row was not archived: % archived, expected 1', v_archived;
  end if;
  if exists (select 1 from players where id = 'dddddddd-0000-4000-8000-0000000dead0') then
    raise exception 'the duplicate player survived the merge';
  end if;

  -- Undo the whole rehearsal. Deleting the survivor cascades to its children.
  delete from player_merge_conflicts where merge_id = (v_report->>'merge_id')::uuid;
  delete from player_merges where id = (v_report->>'merge_id')::uuid;
  delete from players where id = 'cccccccc-0000-4000-8000-0000000cafe0';

  select string_agg(id::text, ', ') into v_bad from players
   where id in ('dddddddd-0000-4000-8000-0000000dead0',
                'cccccccc-0000-4000-8000-0000000cafe0');
  if v_bad is not null then
    raise exception 'the guard left synthetic players behind: %', v_bad;
  end if;
end $$;
