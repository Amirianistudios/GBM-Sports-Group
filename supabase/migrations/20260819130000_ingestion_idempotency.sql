-- ============================================================================
-- GBM INTELLIGENCE — 0006 INGESTION IDEMPOTENCY
-- ----------------------------------------------------------------------------
-- The first data load was applied as generated INSERT statements, which only
-- had to work once. A scheduled pipeline re-reads the same upstream rows every
-- week, so the append-only tables need natural keys or every refresh doubles
-- the history.
--
-- NULLS NOT DISTINCT (PG15+) is essential here: a transfer out of a club GBM
-- does not yet track has a NULL from_club_id, and under default NULL semantics
-- every such row would be considered unique on every run.
-- ============================================================================

-- A player does not move between the same two clubs twice on the same day.
create unique index if not exists transfers_natural_key_idx
  on transfers (player_id, provider_code, transfer_date, from_club_id, to_club_id)
  nulls not distinct;

comment on index transfers_natural_key_idx is
  'Natural key for idempotent transfer ingestion. NULLS NOT DISTINCT so unmapped clubs still deduplicate.';

-- One provider reports one contract per player per club.
create unique index if not exists contracts_player_provider_club_idx
  on contracts (player_id, provider_code, club_id)
  nulls not distinct;

comment on index contracts_player_provider_club_idx is
  'Natural key for idempotent contract ingestion.';

-- Representation is reconciled in application code rather than upserted, because
-- a changed agency must retire the previous row instead of overwriting it — that
-- transition is itself the signal GBM cares about. This index keeps the
-- "current row per player per provider" lookup cheap.
create index if not exists representation_current_lookup_idx
  on representation_records (player_id, provider_code)
  where is_current;

-- Discovery signals are recomputed in full each run; is_current partitions the
-- live set from the historical one.
create index if not exists discovery_signals_current_type_idx
  on discovery_signals (signal_type, score desc)
  where is_current;

-- ============================================================================
-- DATA CONFIDENCE
-- ----------------------------------------------------------------------------
-- An identity corroborated by five providers is not as trustworthy as one seen
-- only on Transfermarkt, and the player page says so. Making this a function
-- keeps the definition in one place rather than duplicated in every importer.
-- ============================================================================
create or replace function gbm_recompute_data_confidence(player_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update players p
  set data_confidence = least(
        1.000,
        0.400 + 0.100 * (
          select count(distinct e.provider_code)
          from player_external_ids e
          where e.player_id = p.id
        )
      ),
      updated_at = now()
  where p.id = any(player_ids);
$$;

comment on function gbm_recompute_data_confidence is
  'Recomputes players.data_confidence from the number of distinct providers that identify the player.';
