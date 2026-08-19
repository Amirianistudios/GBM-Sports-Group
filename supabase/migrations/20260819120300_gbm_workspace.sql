-- ============================================================================
-- GBM INTELLIGENCE — 0004 GBM WORKSPACE
-- ----------------------------------------------------------------------------
-- The proprietary layer: GBM users, watchlists, scout reports, tags, and the
-- automated intelligence output (player events, discovery signals, alerts).
-- Internal scout opinion is deliberately kept in separate tables from external
-- provider statistics — they must never be conflated.
-- ============================================================================

create type gbm_role as enum ('OWNER', 'ADMIN', 'SCOUT', 'ANALYST', 'VIEWER');

create type watchlist_status as enum (
  'NEW', 'RESEARCH', 'WATCHING', 'SCOUT', 'HIGH_PRIORITY',
  'CONTACT', 'CLUB_TARGET', 'REPRESENTATION_TARGET', 'PASS', 'ARCHIVED'
);

create type recommendation as enum (
  'SIGN', 'MONITOR', 'SCOUT_AGAIN', 'REPRESENT', 'PASS', 'UNDECIDED'
);

-- ============================================================================
-- ORGANISATIONS & USERS
-- ============================================================================
create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  full_name    text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table profiles is 'One row per Supabase auth user, created automatically on signup.';

create table organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  role            gbm_role not null default 'VIEWER',
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_idx on organization_members(user_id);

-- Auto-provision a profile row whenever a Supabase auth user is created.
create or replace function gbm_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function gbm_handle_new_user();

-- ----------------------------------------------------------------------------
-- Helper used by RLS policies. SECURITY DEFINER + stable so policy evaluation
-- does not recurse into organization_members' own policies.
-- ----------------------------------------------------------------------------
create or replace function gbm_current_user_role()
returns gbm_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from organization_members
  where user_id = auth.uid()
  order by case role
    when 'OWNER'   then 1
    when 'ADMIN'   then 2
    when 'SCOUT'   then 3
    when 'ANALYST' then 4
    else 5
  end
  limit 1;
$$;

create or replace function gbm_is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from organization_members where user_id = auth.uid());
$$;

create or replace function gbm_can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(gbm_current_user_role() in ('OWNER', 'ADMIN', 'SCOUT', 'ANALYST'), false);
$$;

-- ============================================================================
-- WATCHLISTS
-- ============================================================================
create table watchlists (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name            text not null,
  description     text,
  created_by      uuid references profiles(id) on delete set null,
  is_shared       boolean not null default true,
  color           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index watchlists_org_idx on watchlists(organization_id);

create table watchlist_players (
  id            uuid primary key default gen_random_uuid(),
  watchlist_id  uuid not null references watchlists(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  status        watchlist_status not null default 'NEW',
  priority      int not null default 3 check (priority between 1 and 5),
  assigned_scout_id uuid references profiles(id) on delete set null,
  reason        text,
  added_by      uuid references profiles(id) on delete set null,
  added_at      timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (watchlist_id, player_id)
);

create index watchlist_players_watchlist_idx on watchlist_players(watchlist_id);
create index watchlist_players_player_idx on watchlist_players(player_id);
create index watchlist_players_scout_idx on watchlist_players(assigned_scout_id);

-- ============================================================================
-- NOTES & TAGS
-- ============================================================================
create table player_notes (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  author_id  uuid references profiles(id) on delete set null,
  body       text not null,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index player_notes_player_idx on player_notes(player_id, created_at desc);

create table tags (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  color      text,
  created_at timestamptz not null default now()
);

create table player_tags (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  tag_id     uuid not null references tags(id) on delete cascade,
  added_by   uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (player_id, tag_id)
);

create index player_tags_player_idx on player_tags(player_id);

-- ============================================================================
-- SCOUTING REPORTS — GBM's proprietary opinion layer
-- ============================================================================
create table scouting_reports (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid not null references players(id) on delete cascade,
  scout_id          uuid references profiles(id) on delete set null,
  match_id          uuid references matches(id) on delete set null,
  observed_on       date,
  observed_live     boolean not null default false,
  position_observed text,
  minutes_observed  int,
  opposition        text,

  technical         int check (technical between 1 and 10),
  tactical          int check (tactical between 1 and 10),
  physical          int check (physical between 1 and 10),
  mental            int check (mental between 1 and 10),
  overall_rating    int check (overall_rating between 1 and 10),
  potential_rating  int check (potential_rating between 1 and 10),

  strengths         text,
  weaknesses        text,
  summary           text,
  recommendation    recommendation not null default 'UNDECIDED',
  confidence        int check (confidence between 1 and 5),

  is_draft          boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index scouting_reports_player_idx on scouting_reports(player_id, observed_on desc);
create index scouting_reports_scout_idx on scouting_reports(scout_id);

create table scouting_report_sections (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references scouting_reports(id) on delete cascade,
  heading    text not null,
  body       text,
  sort_order int not null default 0
);

create index scouting_report_sections_report_idx on scouting_report_sections(report_id);

create table scout_player_ratings (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  scout_id   uuid references profiles(id) on delete set null,
  attribute  text not null,
  rating     int not null check (rating between 1 and 10),
  created_at timestamptz not null default now(),
  unique (player_id, scout_id, attribute)
);

create index scout_player_ratings_player_idx on scout_player_ratings(player_id);

-- ============================================================================
-- AUTOMATED INTELLIGENCE OUTPUT
-- ============================================================================

-- Change detection. The system must notice things without anyone searching.
create table player_events (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  event_type    text not null,
  -- PLAYER_CHANGED_CLUB | CONTRACT_EXTENDED | CONTRACT_EXPIRING |
  -- MARKET_VALUE_CHANGED | AGENCY_CHANGED | AGENCY_REMOVED |
  -- NEW_NATIONAL_TEAM_CALLUP | PLAYER_BECAME_STARTER | MINUTES_SPIKE |
  -- GOAL_OUTPUT_SPIKE | PERFORMANCE_SPIKE | NEW_PROVIDER_MATCH | INJURY
  title         text not null,
  detail        text,
  previous_value jsonb,
  new_value     jsonb,
  severity      int not null default 3 check (severity between 1 and 5),
  provider_code text references data_providers(code) on delete set null,
  occurred_at   timestamptz not null default now(),
  detected_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index player_events_player_idx on player_events(player_id, occurred_at desc);
create index player_events_type_idx on player_events(event_type, occurred_at desc);
create index player_events_recent_idx on player_events(detected_at desc);

-- Talent discovery output. Signals are computed, versioned and explainable —
-- never an opaque single "score".
create table discovery_signals (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  signal_type   text not null,
  -- YOUNG_SENIOR_BREAKTHROUGH | RAPID_MINUTES_GROWTH | OUTPERFORMING_AGE_GROUP |
  -- HIGH_OUTPUT_LOW_VALUE | RAPID_PERFORMANCE_IMPROVEMENT | U19_TO_SENIOR_TRANSITION |
  -- STATISTICAL_OUTLIER | UNDERVALUED | POSITIONAL_OUTLIER | UNREPRESENTED_HIGH_POTENTIAL
  score         numeric(6,3) not null,
  -- Human-readable justification. A signal GBM cannot explain is a signal GBM
  -- cannot act on.
  rationale     text,
  evidence      jsonb not null default '{}'::jsonb,
  season_id     uuid references seasons(id) on delete set null,
  model_version text not null default 'v0',
  computed_at   timestamptz not null default now(),
  is_current    boolean not null default true,
  unique (player_id, signal_type, model_version, season_id)
);

create index discovery_signals_type_score_idx on discovery_signals(signal_type, score desc) where is_current;
create index discovery_signals_player_idx on discovery_signals(player_id);

-- Percentile ranks, computed within a peer group (position + age band +
-- competition tier). Comparing all players on identical metrics is meaningless.
create table player_percentiles (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references players(id) on delete cascade,
  season_id      uuid references seasons(id) on delete set null,
  metric_key     text not null,
  raw_value      numeric(14,4),
  per90_value    numeric(14,4),
  percentile     numeric(5,2) check (percentile between 0 and 100),
  peer_group     text not null,        -- e.g. 'CB|U21|FIRST_TIER'
  peer_group_size int,
  computed_at    timestamptz not null default now(),
  unique (player_id, season_id, metric_key, peer_group)
);

create index player_percentiles_player_idx on player_percentiles(player_id);
create index player_percentiles_metric_idx on player_percentiles(metric_key, percentile desc);

create table player_rankings (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references players(id) on delete cascade,
  ranking_key  text not null,
  rank         int not null,
  value        numeric(14,4),
  scope        text,
  season_id    uuid references seasons(id) on delete set null,
  computed_at  timestamptz not null default now(),
  unique (ranking_key, scope, season_id, player_id)
);

create index player_rankings_key_idx on player_rankings(ranking_key, rank);

create table alerts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references profiles(id) on delete cascade,
  player_id     uuid references players(id) on delete cascade,
  player_event_id uuid references player_events(id) on delete cascade,
  watchlist_id  uuid references watchlists(id) on delete cascade,
  title         text not null,
  body          text,
  severity      int not null default 3,
  is_read       boolean not null default false,
  created_at    timestamptz not null default now()
);

create index alerts_user_unread_idx on alerts(user_id, is_read, created_at desc);

create trigger watchlists_touch_updated_at
  before update on watchlists
  for each row execute function gbm_touch_updated_at();

create trigger watchlist_players_touch_updated_at
  before update on watchlist_players
  for each row execute function gbm_touch_updated_at();

create trigger scouting_reports_touch_updated_at
  before update on scouting_reports
  for each row execute function gbm_touch_updated_at();

create trigger player_notes_touch_updated_at
  before update on player_notes
  for each row execute function gbm_touch_updated_at();

create trigger profiles_touch_updated_at
  before update on profiles
  for each row execute function gbm_touch_updated_at();
