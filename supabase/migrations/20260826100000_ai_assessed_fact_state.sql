-- ============================================================================
-- GBM INTELLIGENCE — 0026 AI-ASSESSED FACT STATE AND THE EXTERNAL AGENT PROVIDER
-- ----------------------------------------------------------------------------
-- Preparation for an external AI research team feeding intelligence into the
-- platform. This migration adds only the enum value and the provider row,
-- because `alter type ... add value` cannot be used in the same transaction
-- that adds it; 0027 builds the tables that reference them.
--
-- WHY A NEW FACT STATE
--
-- `fact_state` already separates what a source asserted (SOURCE_REPORTED) from
-- what two sources agree on (MULTI_SOURCE_VERIFIED) and from what a GBM scout
-- saw (GBM_SCOUT). An AI research team is none of those. It reads sources and
-- writes conclusions, which is a fourth thing: an assertion whose reliability
-- depends on a model and a prompt rather than on an observation. Without its
-- own state it would have to borrow one, and borrowing SOURCE_REPORTED is how
-- a model's guess ends up displayed beside a provider's record with no way for
-- a scout to tell them apart.
--
-- WHY THE PROVIDER RANKS LOW
--
-- The priority ladder currently runs GBM_INTERNAL 100, WYSCOUT 95, REEP 90,
-- club and federation 88, Transfermarkt 85, down to Wikidata 50. An AI team
-- researching Transfermarkt is *downstream* of Transfermarkt, so it is given
-- 40 — below every primary source it can cite. This is the important decision
-- in the whole design and it is deliberately conservative:
--
--   · Where a real source already holds a fact, the AI never overrides it.
--     A model that has read a market value cannot outrank the site that
--     published it.
--   · Where no source holds the fact — a recruitment judgement, an adaptation
--     risk, a style description — there is nothing to outrank, and the AI's
--     contribution stands on its own in its own tables.
--
-- The team's value is therefore in the judgement layer, not in overwriting the
-- record. If that is ever wrong for a specific fact, `provider_fact_priority`
-- can raise it for that fact alone rather than globally.
-- ============================================================================

alter type fact_state add value if not exists 'AI_ASSESSED';

insert into data_providers (code, name, kind, default_priority, is_active, requires_credentials, notes)
values (
  'AVENGERS_GROK',
  'Avengers on Grok Bot',
  'AI_RESEARCH',
  40,
  true,
  true,
  'External AI scouting intelligence team. Researches Transfermarkt, Sofascore, FotMob, news and social sources and submits structured intelligence through gbm_intel_submit(). Ranked below every primary source it cites: it may not override a fact a real provider holds. Its own contribution lives in the intel_* tables, where nothing competes with it.'
)
on conflict (code) do update
  set name = excluded.name,
      kind = excluded.kind,
      default_priority = excluded.default_priority,
      notes = excluded.notes;
