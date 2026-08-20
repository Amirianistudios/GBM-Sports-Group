-- ============================================================================
-- GBM INTELLIGENCE — 0012 SEASON STATS IDEMPOTENCY
-- ----------------------------------------------------------------------------
-- player_season_stats was created with a plain UNIQUE constraint on
-- (player_id, season_id, competition_id, club_id, provider_code). Three of
-- those columns are nullable by design — an appearance in a competition the
-- reference data does not describe still deserves its counting statistics —
-- and under default NULL semantics every such row would be considered new on
-- every refresh, doubling the history weekly.
--
-- Same cure as 20260819130000 applied to transfers: NULLS NOT DISTINCT
-- (PG15+), so re-importing the same aggregate updates in place.
-- ============================================================================

alter table player_season_stats
  drop constraint if exists player_season_stats_player_id_season_id_competition_id_club_key;

create unique index if not exists player_season_stats_natural_key_idx
  on player_season_stats (player_id, season_id, competition_id, club_id, provider_code)
  nulls not distinct;

comment on index player_season_stats_natural_key_idx is
  'Natural key for idempotent season-statistics ingestion. NULLS NOT DISTINCT so rows with unresolved season/competition/club still deduplicate.';
