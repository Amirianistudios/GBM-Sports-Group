-- ============================================================================
-- GBM INTELLIGENCE — 0003 PROVENANCE, INGESTION & ENTITY RESOLUTION
-- ----------------------------------------------------------------------------
-- The machinery that makes the data trustworthy:
--   * source_records  — untouched provider payloads, for replay and debugging
--   * source_facts    — per-fact provenance, so every displayed number has a
--                       traceable origin and conflicts are visible, not hidden
--   * ingestion_*     — job orchestration and observability
--   * entity_resolution_* — the cross-provider matching engine
-- ============================================================================

-- ============================================================================
-- RAW SOURCE RECORDS
-- ----------------------------------------------------------------------------
-- Keeps provider-shaped data separate from normalised GBM data so we can
-- reprocess without re-fetching. Change detection via payload_hash prevents
-- storing unlimited identical payloads.
-- ============================================================================
create table source_records (
  id             uuid primary key default gen_random_uuid(),
  provider_code  text not null references data_providers(code) on delete cascade,
  resource_type  text not null,        -- player | team | competition | season | match | transfer | market_value | representation
  external_id    text not null,
  namespace      text,
  payload        jsonb not null,
  payload_hash   text not null,        -- sha256 of the canonicalised payload
  schema_version int not null default 1,
  source_url     text,
  retrieved_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),

  -- Optional links to whatever this payload resolved to.
  player_id      uuid references players(id) on delete set null,
  club_id        uuid references clubs(id) on delete set null,

  -- Same provider + resource + id + identical content is stored once.
  unique (provider_code, resource_type, namespace, external_id, payload_hash)
);

comment on table source_records is
  'Immutable provider payloads. Enables reprocessing without re-fetching and is the audit trail for every normalised fact.';

create index source_records_provider_type_idx on source_records(provider_code, resource_type);
create index source_records_external_idx on source_records(provider_code, external_id);
create index source_records_player_idx on source_records(player_id);
create index source_records_retrieved_idx on source_records(retrieved_at desc);

-- ============================================================================
-- FACT PROVENANCE
-- ----------------------------------------------------------------------------
-- Wyscout says 188cm. Transfermarkt says 187cm. GBM keeps BOTH, displays the
-- higher-priority one, and surfaces the discrepancy rather than silently
-- picking a winner.
-- ============================================================================
create table source_facts (
  id             uuid primary key default gen_random_uuid(),
  entity_type    entity_type not null,
  entity_id      uuid not null,
  fact_key       text not null,        -- 'player.height_cm', 'player.date_of_birth', ...
  value_text     text,
  value_numeric  numeric(18,4),
  value_date     date,
  value_json     jsonb,
  provider_code  text not null references data_providers(code) on delete cascade,
  source_record_id uuid references source_records(id) on delete set null,
  source_url     text,
  state          fact_state not null default 'SOURCE_REPORTED',
  confidence     numeric(4,3) not null default 0.800,
  retrieved_at   timestamptz not null default now(),
  is_current     boolean not null default true,
  created_at     timestamptz not null default now(),

  unique (entity_type, entity_id, fact_key, provider_code)
);

comment on table source_facts is
  'Per-fact provenance. Multiple providers may assert different values for the same fact; all are retained.';

create index source_facts_entity_idx on source_facts(entity_type, entity_id);
create index source_facts_key_idx on source_facts(fact_key);
create index source_facts_current_idx on source_facts(entity_type, entity_id, fact_key) where is_current;

-- ----------------------------------------------------------------------------
-- Conflict detection: any fact where >1 provider reports differing values.
-- Drives the "DATA CONFLICTS" panel on the player profile.
-- ----------------------------------------------------------------------------
create view player_fact_conflicts as
select
  f.entity_id                      as player_id,
  f.fact_key,
  count(distinct coalesce(f.value_text, f.value_numeric::text, f.value_date::text)) as distinct_values,
  count(*)                         as source_count,
  jsonb_agg(
    jsonb_build_object(
      'provider',  f.provider_code,
      'value',     coalesce(f.value_text, f.value_numeric::text, f.value_date::text),
      'url',       f.source_url,
      'retrieved', f.retrieved_at
    ) order by f.provider_code
  )                                as sources
from source_facts f
where f.entity_type = 'PLAYER'
  and f.is_current
group by f.entity_id, f.fact_key
having count(distinct coalesce(f.value_text, f.value_numeric::text, f.value_date::text)) > 1;

comment on view player_fact_conflicts is
  'Facts where providers disagree. Surfaced on the player profile rather than hidden.';

-- ============================================================================
-- INGESTION ORCHESTRATION
-- ============================================================================
create table ingestion_jobs (
  id             uuid primary key default gen_random_uuid(),
  key            text not null unique,     -- 'wyscout_player_sync'
  name           text not null,
  provider_code  text references data_providers(code) on delete set null,
  description    text,
  schedule_cron  text,
  is_enabled     boolean not null default true,
  config         jsonb not null default '{}'::jsonb,
  last_run_at    timestamptz,
  last_status    text,
  created_at     timestamptz not null default now()
);

create table ingestion_runs (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid references ingestion_jobs(id) on delete cascade,
  job_key         text not null,
  provider_code   text references data_providers(code) on delete set null,
  status          text not null default 'RUNNING',   -- RUNNING | SUCCESS | FAILED | PARTIAL
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  records_fetched int not null default 0,
  records_created int not null default 0,
  records_updated int not null default 0,
  records_skipped int not null default 0,
  error_count     int not null default 0,
  triggered_by    text,
  params          jsonb not null default '{}'::jsonb,
  summary         jsonb not null default '{}'::jsonb
);

create index ingestion_runs_job_idx on ingestion_runs(job_key, started_at desc);
create index ingestion_runs_status_idx on ingestion_runs(status);

create table ingestion_errors (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid references ingestion_runs(id) on delete cascade,
  job_key      text,
  provider_code text references data_providers(code) on delete set null,
  resource_type text,
  external_id  text,
  message      text not null,
  detail       jsonb,
  occurred_at  timestamptz not null default now()
);

create index ingestion_errors_run_idx on ingestion_errors(run_id);

-- ============================================================================
-- ENTITY RESOLUTION ENGINE
-- ----------------------------------------------------------------------------
-- Low-confidence matches are NEVER merged automatically. They land in
-- entity_resolution_candidates for a human to adjudicate.
-- ============================================================================
create table entity_resolution_candidates (
  id                 uuid primary key default gen_random_uuid(),
  entity_type        entity_type not null default 'PLAYER',

  -- The GBM entity we think this is (nullable: may be a brand-new identity).
  player_id          uuid references players(id) on delete cascade,
  club_id            uuid references clubs(id) on delete cascade,

  -- The incoming provider identity we are trying to place.
  provider_code      text not null references data_providers(code) on delete cascade,
  external_id        text not null,
  namespace          text,
  candidate_payload  jsonb not null default '{}'::jsonb,

  -- Scoring
  confidence         numeric(4,3) not null check (confidence between 0 and 1),
  match_method       text not null,
  match_signals      jsonb not null default '{}'::jsonb,  -- which signals fired and their weights

  status             text not null default 'PENDING',     -- PENDING | AUTO_ACCEPTED | ACCEPTED | REJECTED | SUPERSEDED
  created_at         timestamptz not null default now()
);

create index erc_status_idx on entity_resolution_candidates(status, confidence desc);
create index erc_player_idx on entity_resolution_candidates(player_id);
create index erc_provider_idx on entity_resolution_candidates(provider_code, external_id);

create table entity_resolution_reviews (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references entity_resolution_candidates(id) on delete cascade,
  reviewer_id   uuid,
  decision      text not null,        -- ACCEPT | REJECT | DEFER
  notes         text,
  decided_at    timestamptz not null default now()
);

create index err_candidate_idx on entity_resolution_reviews(candidate_id);

-- ----------------------------------------------------------------------------
-- Confidence thresholds, stored as data so they can be tuned without a deploy.
-- ----------------------------------------------------------------------------
create table entity_resolution_rules (
  id            uuid primary key default gen_random_uuid(),
  match_method  text not null unique,
  confidence    numeric(4,3) not null,
  auto_accept   boolean not null default false,
  description   text,
  created_at    timestamptz not null default now()
);

insert into entity_resolution_rules (match_method, confidence, auto_accept, description) values
  ('EXACT_PROVIDER_MAPPING', 1.000, true,  'Provider id already present in a trusted registry (e.g. Reep)'),
  ('REEP_REGISTER',          0.990, true,  'Resolved via the Reep canonical register'),
  ('DOB_NAME_CLUB',          0.970, true,  'Exact DOB + normalised name + same club'),
  ('DOB_NAME',               0.930, true,  'Exact DOB + normalised name'),
  ('DOB_NAME_FUZZY',         0.850, false, 'Exact DOB + high name similarity'),
  ('NAME_CLUB_NATIONALITY',  0.700, false, 'Name + club + nationality, no DOB'),
  ('NAME_SIMILAR',           0.400, false, 'Name similarity only — never auto-merge');

comment on table entity_resolution_rules is
  'Tunable confidence thresholds. Only auto_accept=true methods may merge without human review.';
