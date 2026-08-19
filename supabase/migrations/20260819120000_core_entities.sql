-- ============================================================================
-- GBM INTELLIGENCE — 0001 CORE ENTITIES
-- ----------------------------------------------------------------------------
-- Establishes the canonical GBM identity layer. The single most important rule
-- in this platform: GBM owns its own identities. No provider ID is ever the
-- primary key of a football entity. Every provider ID lives in a *_external_ids
-- table hanging off a GBM-minted UUID.
-- ============================================================================

-- Supabase installs extensions into the `extensions` schema. Everything below
-- is schema-qualified accordingly: an unqualified unaccent() would not resolve
-- inside a generated column, and gin_trgm_ops would not resolve in an index.
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pg_trgm"  with schema extensions;  -- fuzzy name matching for entity resolution
create extension if not exists "unaccent" with schema extensions;  -- diacritic-insensitive name normalisation

-- ----------------------------------------------------------------------------
-- Name normalisation helper.
-- Used everywhere we compare names across providers: lowercases, strips
-- diacritics, collapses punctuation/whitespace.
--
-- Must be IMMUTABLE to be usable in a generated column, which is why it calls
-- the two-argument unaccent(regdictionary, text) form — the one-argument form
-- is only STABLE because it depends on the default text-search config.
-- ----------------------------------------------------------------------------
create or replace function gbm_normalize_name(input text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(input, ''))),
        '[^a-z0-9]+', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    ),
    ' '
  );
$$;

comment on function gbm_normalize_name is
  'Canonical name normalisation used by the entity resolution engine.';

-- ============================================================================
-- ENUMS
-- ============================================================================

-- How much we trust a normalised fact. Drives the source-priority display logic.
create type fact_state as enum (
  'VERIFIED',                -- GBM has actively confirmed this
  'MULTI_SOURCE_VERIFIED',   -- >= 2 independent providers agree
  'SOURCE_REPORTED',         -- exactly one provider reports it
  'DERIVED',                 -- computed by GBM from other facts
  'GBM_SCOUT',               -- originates from a GBM scout, not a provider
  'CONFLICTING',             -- providers disagree and none is authoritative
  'UNKNOWN'
);

-- Deliberately models "we looked and nothing was listed" as distinct from
-- "we have not looked". A blank agency field is NOT proof of no representation.
create type representation_status as enum (
  'KNOWN_AGENCY',
  'NO_AGENCY_LISTED',
  'UNKNOWN',
  'CONFLICTING'
);

create type entity_type as enum ('PLAYER', 'CLUB', 'COMPETITION', 'SEASON', 'MATCH', 'COACH');

create type preferred_foot as enum ('LEFT', 'RIGHT', 'BOTH', 'UNKNOWN');

create type competition_tier as enum (
  'FIRST_TIER', 'SECOND_TIER', 'THIRD_TIER', 'FOURTH_TIER', 'LOWER_TIER',
  'YOUTH', 'CUP', 'CONTINENTAL', 'INTERNATIONAL', 'FRIENDLY', 'UNKNOWN'
);

create type competition_gender as enum ('MALE', 'FEMALE', 'MIXED', 'UNKNOWN');

-- ============================================================================
-- DATA PROVIDERS
-- A table, not an enum: new providers must not require a schema migration.
-- ============================================================================
create table data_providers (
  code               text primary key,
  name               text not null,
  kind               text not null default 'API',      -- API | DATASET | SCRAPE | REGISTRY | INTERNAL
  homepage           text,
  -- Base priority when two providers disagree. Higher wins. Per-fact overrides
  -- live in provider_fact_priority because no provider is best at everything.
  default_priority   int  not null default 50,
  is_active          boolean not null default true,
  requires_credentials boolean not null default false,
  notes              text,
  created_at         timestamptz not null default now()
);

comment on table data_providers is
  'Registry of every external football data source GBM can ingest from.';

-- Fact-specific source priority. Wyscout may be authoritative for match stats
-- while Transfermarkt is authoritative for market value. Never one global rule.
create table provider_fact_priority (
  provider_code text not null references data_providers(code) on delete cascade,
  fact_key      text not null,   -- e.g. 'player.height', 'player.market_value'
  priority      int  not null,
  primary key (provider_code, fact_key)
);

comment on table provider_fact_priority is
  'Per-fact provider trust ranking. Height may trust Wyscout; market value trusts Transfermarkt.';

-- ============================================================================
-- GEOGRAPHY
-- ============================================================================
create table countries (
  id            uuid primary key default gen_random_uuid(),
  iso2          text unique,
  iso3          text unique,
  name          text not null,
  normalized_name text generated always as (gbm_normalize_name(name)) stored,
  confederation text,   -- UEFA | CONMEBOL | CAF | AFC | CONCACAF | OFC
  created_at    timestamptz not null default now()
);

create index countries_normalized_name_idx on countries using gin (normalized_name extensions.gin_trgm_ops);

-- ============================================================================
-- COMPETITIONS
-- ============================================================================
create table competitions (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  normalized_name  text generated always as (gbm_normalize_name(name)) stored,
  short_name       text,
  country_id       uuid references countries(id) on delete set null,
  area_name        text,
  tier             competition_tier not null default 'UNKNOWN',
  gender           competition_gender not null default 'MALE',
  is_youth         boolean not null default false,
  -- GBM's own 1-100 assessment of competition difficulty. Essential for
  -- age-adjusted analysis: 12 goals in the Eredivisie != 12 in the Conference.
  strength_rating  numeric(5,2),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index competitions_normalized_name_idx on competitions using gin (normalized_name extensions.gin_trgm_ops);
create index competitions_country_idx on competitions(country_id);

create table competition_external_ids (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  provider_code  text not null references data_providers(code) on delete cascade,
  namespace      text,
  external_id    text not null,
  url            text,
  confidence     numeric(4,3) not null default 1.000,
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  unique (provider_code, namespace, external_id)
);

create index competition_external_ids_competition_idx on competition_external_ids(competition_id);

-- ============================================================================
-- SEASONS
-- ============================================================================
create table seasons (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  name           text not null,        -- '2025/2026'
  start_date     date,
  end_date       date,
  is_current     boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (competition_id, name)
);

create index seasons_competition_idx on seasons(competition_id);
create index seasons_current_idx on seasons(is_current) where is_current;

create table season_external_ids (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references seasons(id) on delete cascade,
  provider_code text not null references data_providers(code) on delete cascade,
  namespace     text,
  external_id   text not null,
  url           text,
  confidence    numeric(4,3) not null default 1.000,
  created_at    timestamptz not null default now(),
  unique (provider_code, namespace, external_id)
);

create index season_external_ids_season_idx on season_external_ids(season_id);

-- ============================================================================
-- CLUBS
-- ============================================================================
create table clubs (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  normalized_name  text generated always as (gbm_normalize_name(name)) stored,
  official_name    text,
  short_name       text,
  country_id       uuid references countries(id) on delete set null,
  city             text,
  founded_year     int,
  crest_url        text,
  website          text,
  is_national_team boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index clubs_normalized_name_idx on clubs using gin (normalized_name extensions.gin_trgm_ops);
create index clubs_country_idx on clubs(country_id);

create table club_external_ids (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references clubs(id) on delete cascade,
  provider_code text not null references data_providers(code) on delete cascade,
  namespace     text,
  external_id   text not null,
  url           text,
  confidence    numeric(4,3) not null default 1.000,
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (provider_code, namespace, external_id)
);

create index club_external_ids_club_idx on club_external_ids(club_id);

create table club_aliases (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references clubs(id) on delete cascade,
  alias           text not null,
  normalized_alias text generated always as (gbm_normalize_name(alias)) stored,
  source          text,
  created_at      timestamptz not null default now()
);

create index club_aliases_normalized_idx on club_aliases using gin (normalized_alias extensions.gin_trgm_ops);
create index club_aliases_club_idx on club_aliases(club_id);

-- ============================================================================
-- PLAYERS — the canonical GBM identity
-- ============================================================================
create table players (
  id                    uuid primary key default gen_random_uuid(),

  -- Display identity
  full_name             text not null,
  short_name            text,
  first_name            text,
  last_name             text,
  normalized_name       text generated always as (gbm_normalize_name(full_name)) stored,

  -- Biographical
  date_of_birth         date,
  birth_country_id      uuid references countries(id) on delete set null,
  birth_place           text,
  nationality_country_id uuid references countries(id) on delete set null,
  second_nationality_country_id uuid references countries(id) on delete set null,

  -- Physical
  height_cm             int check (height_cm is null or (height_cm between 120 and 230)),
  weight_kg             int check (weight_kg is null or (weight_kg between 30 and 160)),
  foot                  preferred_foot not null default 'UNKNOWN',

  -- Football
  primary_position      text,
  secondary_positions   text[] not null default '{}',
  current_club_id       uuid references clubs(id) on delete set null,
  shirt_number          int,
  is_goalkeeper         boolean not null default false,

  -- Media
  image_url             text,

  -- GBM operational metadata
  gbm_status            text not null default 'NONE',
  data_confidence       numeric(4,3) not null default 0.500,
  last_enriched_at      timestamptz,

  is_retired            boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table players is
  'Canonical GBM player identity. players.id is a GBM UUID and is never a provider id.';
comment on column players.data_confidence is
  '0-1 score of how well-resolved and cross-verified this identity is.';

create index players_normalized_name_idx on players using gin (normalized_name extensions.gin_trgm_ops);
create index players_dob_idx on players(date_of_birth);
create index players_current_club_idx on players(current_club_id);
create index players_nationality_idx on players(nationality_country_id);
create index players_position_idx on players(primary_position);
-- The entity-resolution workhorse: name + DOB is the strongest cheap signal.
create index players_name_dob_idx on players(normalized_name, date_of_birth);

create table player_aliases (
  id               uuid primary key default gen_random_uuid(),
  player_id        uuid not null references players(id) on delete cascade,
  alias            text not null,
  normalized_alias text generated always as (gbm_normalize_name(alias)) stored,
  alias_type       text not null default 'NAME_VARIANT',  -- NAME_VARIANT | NICKNAME | TRANSLITERATION | MAIDEN
  source_provider  text references data_providers(code) on delete set null,
  created_at       timestamptz not null default now()
);

create index player_aliases_normalized_idx on player_aliases using gin (normalized_alias extensions.gin_trgm_ops);
create index player_aliases_player_idx on player_aliases(player_id);

-- ----------------------------------------------------------------------------
-- THE CROSS-PROVIDER IDENTITY MAP
-- This table is the reason the platform works. One GBM player fans out to
-- Wyscout / Transfermarkt / Sofascore / FotMob / BeSoccer / Reep / SportMonks.
-- ----------------------------------------------------------------------------
create table player_external_ids (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  provider_code text not null references data_providers(code) on delete cascade,
  -- Some providers namespace their ids (Transfermarkt 'spieler' vs 'profil').
  namespace     text,
  external_id   text not null,
  url           text,
  -- How we arrived at this link, and how much we trust it.
  confidence    numeric(4,3) not null default 1.000 check (confidence between 0 and 1),
  match_method  text,          -- EXACT_PROVIDER_MAPPING | REEP | DOB_NAME_CLUB | DOB_NAME | MANUAL
  verified_at   timestamptz,
  verified_by   uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- One external id maps to at most one GBM player.
  unique (provider_code, namespace, external_id)
);

comment on table player_external_ids is
  'Cross-provider identity map. The core of GBM entity resolution.';

create index player_external_ids_player_idx on player_external_ids(player_id);
create index player_external_ids_provider_idx on player_external_ids(provider_code);
-- Supports "which players do we still lack a Transfermarkt id for?"
create index player_external_ids_provider_player_idx on player_external_ids(provider_code, player_id);

-- ============================================================================
-- CAREER / CLUB HISTORY
-- ============================================================================
create table player_team_history (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references players(id) on delete cascade,
  club_id        uuid references clubs(id) on delete set null,
  club_name_raw  text,          -- retained when the club could not be resolved
  season_id      uuid references seasons(id) on delete set null,
  competition_id uuid references competitions(id) on delete set null,
  start_date     date,
  end_date       date,
  is_loan        boolean not null default false,
  is_current     boolean not null default false,
  shirt_number   int,
  source_provider text references data_providers(code) on delete set null,
  created_at     timestamptz not null default now()
);

create index player_team_history_player_idx on player_team_history(player_id);
create index player_team_history_club_idx on player_team_history(club_id);
create index player_team_history_current_idx on player_team_history(player_id) where is_current;

-- ============================================================================
-- TRIGGERS — updated_at maintenance
-- ============================================================================
create or replace function gbm_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger players_touch_updated_at
  before update on players
  for each row execute function gbm_touch_updated_at();

create trigger clubs_touch_updated_at
  before update on clubs
  for each row execute function gbm_touch_updated_at();

create trigger competitions_touch_updated_at
  before update on competitions
  for each row execute function gbm_touch_updated_at();

create trigger player_external_ids_touch_updated_at
  before update on player_external_ids
  for each row execute function gbm_touch_updated_at();
