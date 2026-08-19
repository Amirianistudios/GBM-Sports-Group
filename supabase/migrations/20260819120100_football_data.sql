-- ============================================================================
-- GBM INTELLIGENCE — 0002 FOOTBALL DATA
-- ----------------------------------------------------------------------------
-- Matches, performance statistics, transfers, contracts, market values and
-- representation. Everything here is *normalised* GBM data; the untouched
-- provider payloads live in source_records (migration 0003).
-- ============================================================================

-- ============================================================================
-- MATCHES
-- ============================================================================
create table matches (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete set null,
  season_id      uuid references seasons(id) on delete set null,
  home_club_id   uuid references clubs(id) on delete set null,
  away_club_id   uuid references clubs(id) on delete set null,
  kickoff_at     timestamptz,
  match_date     date,
  home_score     int,
  away_score     int,
  status         text not null default 'SCHEDULED',   -- SCHEDULED | PLAYED | POSTPONED | CANCELLED
  round_name     text,
  matchday       int,
  venue          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index matches_season_idx on matches(season_id);
create index matches_date_idx on matches(match_date desc);
create index matches_home_club_idx on matches(home_club_id);
create index matches_away_club_idx on matches(away_club_id);

create table match_external_ids (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references matches(id) on delete cascade,
  provider_code text not null references data_providers(code) on delete cascade,
  namespace     text,
  external_id   text not null,
  url           text,
  created_at    timestamptz not null default now(),
  unique (provider_code, namespace, external_id)
);

create index match_external_ids_match_idx on match_external_ids(match_id);

-- ============================================================================
-- PERFORMANCE STATISTICS
-- ----------------------------------------------------------------------------
-- Core countable metrics get real columns (fast to filter and rank on).
-- Everything provider-specific and advanced goes into `advanced` jsonb so a
-- new Wyscout metric never requires a migration.
-- ============================================================================
create table player_season_stats (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references players(id) on delete cascade,
  season_id       uuid references seasons(id) on delete set null,
  competition_id  uuid references competitions(id) on delete set null,
  club_id         uuid references clubs(id) on delete set null,
  provider_code   text not null references data_providers(code) on delete cascade,

  matches_played  int,
  matches_started int,
  minutes_played  int,
  goals           int,
  assists         int,
  yellow_cards    int,
  red_cards       int,

  -- Expected metrics where the provider supplies them
  xg              numeric(8,3),
  xa              numeric(8,3),

  shots           int,
  shots_on_target int,
  key_passes      int,
  passes          int,
  passes_accurate int,
  dribbles        int,
  dribbles_successful int,
  duels           int,
  duels_won       int,
  aerial_duels    int,
  aerial_duels_won int,
  interceptions   int,
  tackles         int,
  clearances      int,
  progressive_passes int,
  progressive_carries int,
  touches_in_box  int,

  -- Goalkeeper
  saves           int,
  goals_conceded  int,
  clean_sheets    int,

  -- Provider-specific / advanced metrics, kept verbatim.
  advanced        jsonb not null default '{}'::jsonb,

  retrieved_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One row per player/season/competition/club per provider.
  unique (player_id, season_id, competition_id, club_id, provider_code)
);

comment on column player_season_stats.advanced is
  'Provider-specific advanced metrics kept verbatim so new metrics need no migration.';

create index player_season_stats_player_idx on player_season_stats(player_id);
create index player_season_stats_season_idx on player_season_stats(season_id);
create index player_season_stats_minutes_idx on player_season_stats(minutes_played desc);
create index player_season_stats_advanced_gin on player_season_stats using gin (advanced);

create table player_match_stats (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references players(id) on delete cascade,
  match_id       uuid references matches(id) on delete cascade,
  club_id        uuid references clubs(id) on delete set null,
  provider_code  text not null references data_providers(code) on delete cascade,

  minutes_played int,
  started        boolean,
  goals          int,
  assists        int,
  yellow_cards   int,
  red_cards      int,
  rating         numeric(4,2),
  position_played text,

  advanced       jsonb not null default '{}'::jsonb,

  retrieved_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (player_id, match_id, provider_code)
);

create index player_match_stats_player_idx on player_match_stats(player_id);
create index player_match_stats_match_idx on player_match_stats(match_id);

-- ============================================================================
-- TRANSFERS
-- ============================================================================
create table transfers (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references players(id) on delete cascade,
  from_club_id   uuid references clubs(id) on delete set null,
  to_club_id     uuid references clubs(id) on delete set null,
  from_club_name_raw text,
  to_club_name_raw   text,
  transfer_date  date,
  season_name    text,
  transfer_type  text,                       -- PERMANENT | LOAN | LOAN_RETURN | FREE | END_OF_CONTRACT | YOUTH
  fee_amount     numeric(14,2),
  fee_currency   text default 'EUR',
  is_loan        boolean not null default false,
  is_free        boolean not null default false,
  market_value_at_transfer numeric(14,2),
  provider_code  text not null references data_providers(code) on delete cascade,
  source_url     text,
  retrieved_at   timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index transfers_player_idx on transfers(player_id);
create index transfers_date_idx on transfers(transfer_date desc);
create index transfers_to_club_idx on transfers(to_club_id);
-- Idempotency: re-running an import must not duplicate the same transfer.
create unique index transfers_dedupe_idx
  on transfers(player_id, provider_code, coalesce(transfer_date, '1900-01-01'::date),
               coalesce(to_club_name_raw, ''), coalesce(from_club_name_raw, ''));

-- ============================================================================
-- CONTRACTS
-- ============================================================================
create table contracts (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references players(id) on delete cascade,
  club_id        uuid references clubs(id) on delete set null,
  start_date     date,
  expires_on     date,
  option_until   date,
  is_loan        boolean not null default false,
  loan_expires_on date,
  status         text not null default 'ACTIVE',   -- ACTIVE | EXPIRED | FREE_AGENT | UNKNOWN
  provider_code  text not null references data_providers(code) on delete cascade,
  source_url     text,
  retrieved_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Powers the "contract expires in N months" scouting filter.
create index contracts_expires_idx on contracts(expires_on) where expires_on is not null;
create index contracts_player_idx on contracts(player_id);
create unique index contracts_player_provider_idx
  on contracts(player_id, provider_code, coalesce(club_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ============================================================================
-- MARKET VALUES
-- ----------------------------------------------------------------------------
-- Full history, not just current. Enables trend analysis and the
-- "performance rising faster than market value" undervaluation signal.
-- ============================================================================
create table market_values (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  value_amount  numeric(14,2) not null,
  currency      text not null default 'EUR',
  valued_on     date not null,
  club_id       uuid references clubs(id) on delete set null,
  age_at_valuation int,
  provider_code text not null references data_providers(code) on delete cascade,
  source_url    text,
  retrieved_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (player_id, provider_code, valued_on)
);

create index market_values_player_date_idx on market_values(player_id, valued_on desc);
create index market_values_amount_idx on market_values(value_amount desc);

-- ============================================================================
-- REPRESENTATION / AGENCY  — a first-class GBM module
-- ----------------------------------------------------------------------------
-- Critical rule encoded here: we store what the source ACTUALLY SHOWED.
-- 'NO_AGENCY_LISTED' means the page displayed no agency. It is explicitly NOT
-- a claim that the player is unrepresented.
-- ============================================================================
create table representation_records (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references players(id) on delete cascade,
  agency_name     text,
  agency_name_normalized text generated always as (gbm_normalize_name(agency_name)) stored,
  agent_name      text,
  status          representation_status not null default 'UNKNOWN',
  provider_code   text not null references data_providers(code) on delete cascade,
  source_url      text,
  -- Distinguishes "checked recently and still blank" from stale data.
  retrieved_at    timestamptz not null default now(),
  is_current      boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on table representation_records is
  'What a source displayed about representation at a point in time. NO_AGENCY_LISTED means the page showed nothing, NOT that the player is unrepresented.';

create index representation_player_idx on representation_records(player_id);
create index representation_status_idx on representation_records(status) where is_current;
create index representation_agency_idx on representation_records using gin (agency_name_normalized extensions.gin_trgm_ops);
-- Only one 'current' record per player per provider; history is preserved by
-- flipping is_current to false rather than deleting.
create unique index representation_current_idx
  on representation_records(player_id, provider_code) where is_current;

-- ============================================================================
-- INJURIES
-- ============================================================================
create table player_injuries (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  description   text,
  injury_type   text,
  started_on    date,
  expected_return_on date,
  ended_on      date,
  games_missed  int,
  provider_code text not null references data_providers(code) on delete cascade,
  retrieved_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index player_injuries_player_idx on player_injuries(player_id);

-- ============================================================================
-- NATIONAL TEAM
-- ============================================================================
create table player_national_team_records (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references players(id) on delete cascade,
  country_id     uuid references countries(id) on delete set null,
  team_name      text,
  level          text,          -- SENIOR | U23 | U21 | U20 | U19 | U18 | U17 | U16
  caps           int,
  goals          int,
  debut_on       date,
  last_call_up_on date,
  provider_code  text not null references data_providers(code) on delete cascade,
  retrieved_at   timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index player_national_team_player_idx on player_national_team_records(player_id);
create index player_national_team_level_idx on player_national_team_records(level);

create trigger matches_touch_updated_at
  before update on matches
  for each row execute function gbm_touch_updated_at();

create trigger player_season_stats_touch_updated_at
  before update on player_season_stats
  for each row execute function gbm_touch_updated_at();

create trigger contracts_touch_updated_at
  before update on contracts
  for each row execute function gbm_touch_updated_at();
