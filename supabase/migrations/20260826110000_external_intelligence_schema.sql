-- ============================================================================
-- GBM INTELLIGENCE — 0027 EXTERNAL INTELLIGENCE SCHEMA
-- ----------------------------------------------------------------------------
-- Tables for an external AI research team to feed structured football
-- intelligence into the platform, and the contract it writes through.
--
-- WHAT IS DELIBERATELY *NOT* HERE
--
-- Most of what such a team produces already has a home, and duplicating it
-- would split the record in two:
--
--   · Player profiles, age, nationality, position, clubs → `players`
--   · Contracts and market value history → `contracts`, `market_values`
--   · Transfer history and career progression → `transfers`,
--     `player_team_history`
--   · Agent and representation → `representation_records`
--   · Appearances, minutes, goals, assists, xG, xA, shots, progressive passes
--     and carries, passing, tackles, interceptions, duels, aerial duels →
--     `player_season_stats`, which already carries every one of those columns
--     plus an `advanced` jsonb for heatmaps and anything else a provider adds
--   · Match ratings → `player_match_stats.rating`
--   · News, club announcements, rumours, injuries → `player_news`
--
-- So the team writes into those tables through the submission function, with
-- provenance, rather than into a parallel schema. What follows is only the
-- part that genuinely has nowhere to live: versioned AI reports, recruitment
-- judgements, and adaptation analysis.
--
-- THE ONE RULE THAT SHAPES ALL OF IT
--
-- `CLAUDE.md`: scout opinion never mixes with provider statistics. AI
-- judgement is a third category and gets the same treatment — its own tables,
-- its own provenance, never written into `scouting_reports`, which means a
-- human scout looked at a player. A recruitment recommendation from a model
-- and one from a scout who stood on the touchline must never be indexed as
-- the same kind of thing.
-- ============================================================================

-- ============================================================================
-- WHO MAY SUBMIT
-- ----------------------------------------------------------------------------
-- A registered agent is an auth user that is deliberately NOT a member of the
-- organisation. `gbm_is_member()` is false for it, so every read policy in the
-- database refuses it: the bot cannot list the portfolio, read guardian
-- details, or see a scouting report. It can only call the submission function,
-- which is SECURITY DEFINER and writes on its behalf.
--
-- That asymmetry is the point. An external system that can write intelligence
-- should not thereby gain the ability to read a minor's guardian contact.
-- ============================================================================
create table if not exists intel_agents (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  agent_code    text not null unique,
  display_name  text not null,
  provider_code text not null references data_providers(code),
  is_active     boolean not null default true,
  /* Submission kinds this agent may use. An agent that only writes news
     should not be able to rewrite market values because its key leaked. */
  scopes        text[] not null default '{}',
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

comment on table intel_agents is
  'External AI research agents permitted to submit intelligence. Deliberately not organisation members: they can write through gbm_intel_submit() and read nothing.';

-- ============================================================================
-- THE SUBMISSION LEDGER
-- ----------------------------------------------------------------------------
-- Every call is recorded, accepted or not. Two jobs:
--
--   · Idempotency. The agent supplies `submission_key`; a repeat of the same
--     key returns the original result instead of writing twice. An external
--     system that retries on a timeout must not double-write a valuation.
--   · Audit. When a number on a player profile looks wrong, this is where the
--     payload that produced it is found, with the time and the agent.
-- ============================================================================
create table if not exists intel_submissions (
  id             uuid primary key default gen_random_uuid(),
  agent_id       uuid not null references intel_agents(id) on delete cascade,
  submission_key text not null,
  kind           text not null,
  payload        jsonb not null,
  payload_hash   text not null,
  status         text not null check (status in ('ACCEPTED', 'REJECTED', 'DUPLICATE')),
  result         jsonb,
  error          text,
  received_at    timestamptz not null default now(),
  unique (agent_id, submission_key)
);

create index if not exists intel_submissions_agent_time_idx
  on intel_submissions (agent_id, received_at desc);

comment on table intel_submissions is
  'Append-only ledger of every submission. The unique (agent, submission_key) is what makes retries safe.';

-- ============================================================================
-- VERSIONED REPORTS
-- ----------------------------------------------------------------------------
-- A scouting profile is not a fact that gets overwritten; it is a document
-- that gets rewritten as the player develops. Superseding rather than updating
-- keeps the earlier assessment readable, which is what makes "we were wrong
-- about him in March" a thing the agency can actually see.
--
-- `is_current` is maintained by trigger, so a reader never has to work out
-- which version is live by comparing timestamps.
-- ============================================================================
create table if not exists intel_reports (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references players(id) on delete cascade,
  agent_id       uuid not null references intel_agents(id),
  submission_id  uuid references intel_submissions(id) on delete set null,
  report_type    text not null check (report_type in
                   ('PROFILE', 'PERFORMANCE', 'MARKET', 'RECRUITMENT', 'NEWS_DIGEST')),
  version        integer not null default 1,
  supersedes_id  uuid references intel_reports(id) on delete set null,
  is_current     boolean not null default true,
  headline       text not null,
  summary        text,
  /* [{heading, body}] — prose the platform renders without interpreting. */
  sections       jsonb not null default '[]'::jsonb,
  /* The numbers behind the prose, so a claim can be checked against them. */
  metrics        jsonb,
  /* [{name, url, retrieved_at, reliability}] — what the agent actually read.
     A report with an empty sources array is an opinion, and the interface
     says so. */
  sources        jsonb not null default '[]'::jsonb,
  model_name     text,
  confidence     numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  period_start   date,
  period_end     date,
  created_at     timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create index if not exists intel_reports_player_current_idx
  on intel_reports (player_id, report_type) where is_current;
create index if not exists intel_reports_player_time_idx
  on intel_reports (player_id, created_at desc);

comment on table intel_reports is
  'AI-generated scouting documents, versioned by supersession. Never mixed with scouting_reports, which record a human observation.';

/**
 * Exactly one current report per player and type. Done in a trigger rather
 * than left to the writer: the invariant readers depend on must not be a
 * convention the submission function is trusted to remember.
 */
create or replace function gbm_intel_reports_supersede()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.is_current then
    update intel_reports
       set is_current = false
     where player_id = new.player_id
       and report_type = new.report_type
       and id <> new.id
       and is_current;
  end if;
  return new;
end $$;

drop trigger if exists intel_reports_supersede on intel_reports;
create trigger intel_reports_supersede
  after insert on intel_reports
  for each row execute function gbm_intel_reports_supersede();

-- ============================================================================
-- THE RECRUITMENT LOGIC ENGINE'S OUTPUT
-- ----------------------------------------------------------------------------
-- "Suitable for Belgian First Division", "high resale value profile" — these
-- are judgements about a fit between a player and a destination, so the
-- destination is a column, not a phrase buried in prose. That is what lets the
-- platform answer "which players did the engine call ready for the Jupiler Pro
-- League" without reading every report.
--
-- The `recommendation` enum is reused from human scouting on purpose: the same
-- vocabulary, so SIGN means SIGN whoever said it. What differs is the table it
-- is written in, which is how the two are kept apart.
-- ============================================================================
create table if not exists intel_recommendations (
  id                    uuid primary key default gen_random_uuid(),
  player_id             uuid not null references players(id) on delete cascade,
  agent_id              uuid not null references intel_agents(id),
  report_id             uuid references intel_reports(id) on delete set null,
  submission_id         uuid references intel_submissions(id) on delete set null,
  recommendation        recommendation not null,
  /* Free text so the engine can say something the schema did not anticipate. */
  fit_label             text,
  target_competition_id uuid references competitions(id) on delete set null,
  target_club_id        uuid references clubs(id) on delete set null,
  age_profile           text,
  financial_band        text,
  playing_style         text,
  development_potential text,
  resale_potential      text,
  rationale             text,
  confidence            numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  is_current            boolean not null default true,
  created_at            timestamptz not null default now()
);

create index if not exists intel_recommendations_player_idx
  on intel_recommendations (player_id, created_at desc);
create index if not exists intel_recommendations_target_idx
  on intel_recommendations (target_competition_id) where is_current;

comment on table intel_recommendations is
  'AI recruitment judgements: a player, a destination, and why. Separate from scouting_reports so a model''s view is never counted as a scout''s.';

-- ============================================================================
-- ADAPTATION AND TRANSFER PATHWAY
-- ----------------------------------------------------------------------------
-- A Georgian player moving to Belgium is not one number. It is a technical
-- gap, a competition gap, and a risk that follows from both — recorded
-- separately so a scout can disagree with one part without discarding the
-- assessment.
-- ============================================================================
create table if not exists intel_adaptation_assessments (
  id                    uuid primary key default gen_random_uuid(),
  player_id             uuid not null references players(id) on delete cascade,
  agent_id              uuid not null references intel_agents(id),
  submission_id         uuid references intel_submissions(id) on delete set null,
  from_competition_id   uuid references competitions(id) on delete set null,
  to_competition_id     uuid references competitions(id) on delete set null,
  /* Where a competition is not in the database yet, the label still records
     what was assessed rather than dropping the analysis. */
  from_competition_name text,
  to_competition_name   text,
  technical_gap         text,
  competition_gap       text,
  adaptation_risk       text check (adaptation_risk is null or
                          adaptation_risk in ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN')),
  risk_score            numeric check (risk_score is null or (risk_score >= 0 and risk_score <= 100)),
  next_step             text,
  rationale             text,
  confidence            numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  is_current            boolean not null default true,
  created_at            timestamptz not null default now()
);

create index if not exists intel_adaptation_player_idx
  on intel_adaptation_assessments (player_id, created_at desc);

comment on table intel_adaptation_assessments is
  'Transfer pathway analysis: technical gap, competition gap, adaptation risk and the suggested next step.';

-- ============================================================================
-- NEWS: RELIABILITY IS NOT CONFIDENCE
-- ----------------------------------------------------------------------------
-- `player_news.confidence` already records how sure the collector is that the
-- item is *about this player*. Two further things matter for a rumour and had
-- nowhere to go:
--
--   · `reliability` — how much the *source* is worth. A club's own
--     announcement and an anonymous transfer account are not the same
--     evidence even when both are certainly about the player.
--   · `impact` — what it would mean for GBM if true. A contract renewal and a
--     cruciate injury are both "news" and are not both worth a phone call.
-- ============================================================================
alter table player_news
  add column if not exists reliability numeric
    check (reliability is null or (reliability >= 0 and reliability <= 1)),
  add column if not exists impact text
    check (impact is null or impact in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE')),
  add column if not exists impact_note text,
  add column if not exists agent_id uuid references intel_agents(id) on delete set null;

comment on column player_news.reliability is
  'How much the source is worth (0–1). Distinct from `confidence`, which is how sure we are the item concerns this player.';
comment on column player_news.impact is
  'What it would mean for GBM if true — the field that decides whether anyone is called.';

-- ============================================================================
-- WHO COLLECTED IT, AS OPPOSED TO WHERE IT CAME FROM
-- ----------------------------------------------------------------------------
-- When the AI team reads a Sofascore page, the fact's provider is SOFASCORE —
-- that is where it came from, and that is what the priority ladder must judge.
-- But the platform still needs to know the AI team fetched it, so a
-- systematic collection error can be traced to its collector rather than
-- blamed on the source.
-- ============================================================================
alter table source_records
  add column if not exists collected_by text references data_providers(code);

comment on column source_records.collected_by is
  'The agent that fetched this record, when different from the provider that published it. Priority still follows provider_code; this is for audit.';

-- ============================================================================
-- READ ACCESS
-- ----------------------------------------------------------------------------
-- Members read intelligence like any other football data. Nobody writes
-- through these policies at all — every write goes through the submission
-- function, which is SECURITY DEFINER, so there is exactly one door.
--
-- Role lookups are wrapped in a scalar subquery so Postgres hoists them to an
-- InitPlan; see migration 0025 for why a bare call costs 650x.
-- ============================================================================
alter table intel_agents                enable row level security;
alter table intel_submissions           enable row level security;
alter table intel_reports               enable row level security;
alter table intel_recommendations       enable row level security;
alter table intel_adaptation_assessments enable row level security;

drop policy if exists "members can read" on intel_reports;
create policy "members can read" on intel_reports
  for select to authenticated using ((select gbm_is_member()));

drop policy if exists "members can read" on intel_recommendations;
create policy "members can read" on intel_recommendations
  for select to authenticated using ((select gbm_is_member()));

drop policy if exists "members can read" on intel_adaptation_assessments;
create policy "members can read" on intel_adaptation_assessments
  for select to authenticated using ((select gbm_is_member()));

/* The agent registry and the ledger name an external system and carry raw
   payloads, so they are management-only rather than member-readable. */
drop policy if exists "managers can read agents" on intel_agents;
create policy "managers can read agents" on intel_agents
  for select to authenticated using ((select gbm_can_manage_staff()));

drop policy if exists "managers can read submissions" on intel_submissions;
create policy "managers can read submissions" on intel_submissions
  for select to authenticated using ((select gbm_can_manage_staff()));

grant select on intel_reports, intel_recommendations, intel_adaptation_assessments to authenticated;
grant select on intel_agents, intel_submissions to authenticated;
