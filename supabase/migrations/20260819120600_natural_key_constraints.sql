-- ============================================================================
-- GBM INTELLIGENCE — 0005b NATURAL KEYS FOR REFERENCE ENTITIES
-- ----------------------------------------------------------------------------
-- Captured from the hosted project, where it had been applied directly and
-- never written to a migration file.
-- ============================================================================

-- Natural-key uniqueness for reference entities. Verified against the
-- Transfermarkt dataset (796 clubs, 65 competitions): zero collisions.
create unique index if not exists countries_name_uniq on countries(normalized_name);
create unique index if not exists clubs_name_uniq     on clubs(normalized_name);
create unique index if not exists competitions_name_area_uniq
  on competitions(normalized_name, coalesce(area_name, ''));

-- Deliberately NOT applied to players.
-- (normalized_name, date_of_birth) collides for real, distinct footballers
-- (1 collision already present in a 50k-row sample), so enforcing it as a
-- constraint would silently merge two different people. Player import
-- idempotency is instead guaranteed by the unique index on
-- player_external_ids(provider_code, namespace, external_id): an import skips
-- any provider id it has already mapped, and unmapped ids go through entity
-- resolution rather than being blindly inserted.
