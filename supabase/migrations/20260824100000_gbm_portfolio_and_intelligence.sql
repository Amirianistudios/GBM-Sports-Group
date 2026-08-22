-- ============================================================================
-- GBM INTELLIGENCE — 0021 THE AGENCY'S OWN LAYER
-- ----------------------------------------------------------------------------
-- Everything so far has been about players the world knows. This migration adds
-- the part only GBM knows: who the agency actually represents, who is
-- responsible for them, what a guardian may be contacted about, what happened
-- to a tracked player in the last hour, and whether the machinery that answers
-- that question is alive.
--
--  A. Roles that name real jobs, and permission predicates built on them.
--  B. gbm_portfolio — GBM's own representation record. Distinct from
--     representation_records on purpose: those are provider assertions with
--     provenance, this is the agency's own truth. A provider omitting a player
--     is not evidence, so nothing here is ever removed by an import.
--  C. player_guardians — minors. Readable only by management roles; RLS, not
--     a hidden component.
--  D. player_news / player_live_status — the hourly layer, provenance on every
--     row, freshness stored rather than implied.
--  E. Add Player — members could only read `players`; management can now write.
--  F. Two GBM-owned image slots, kept apart from the provider portrait.
--
-- ingestion_runs is reused for hourly run history. It already records
-- started/finished, counts and errors per job_key; a second run table would
-- duplicate it for no gain.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Roles
-- ----------------------------------------------------------------------------
-- Lower rank = more authority. Legacy values map onto the three real jobs so
-- existing memberships keep working: ADMIN sits with the executive director,
-- SCOUT and ANALYST with the scout.
create or replace function gbm_role_rank(r gbm_role)
returns int
language sql immutable parallel safe
set search_path = ''
as $$
  select case r
    when 'OWNER' then 1
    when 'EXECUTIVE_DIRECTOR' then 2
    when 'ADMIN' then 2
    when 'PLAYER_SERVICE_SCOUT' then 3
    when 'SCOUT' then 3
    when 'ANALYST' then 4
    else 5
  end;
$$;

comment on function gbm_role_rank is
  'Authority order for gbm_role. Lower is higher. Legacy roles map onto the three GBM jobs.';

create or replace function gbm_current_user_role()
returns gbm_role
language sql stable security definer
set search_path = public
as $$
  select role from organization_members
  where user_id = auth.uid()
  order by gbm_role_rank(role)
  limit 1;
$$;

-- Everyone but a VIEWER may record work.
create or replace function gbm_can_write()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(gbm_role_rank(gbm_current_user_role()) <= 4, false);
$$;

-- Portfolio, contacts and represented players: owner and executive director.
create or replace function gbm_can_manage_portfolio()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(gbm_role_rank(gbm_current_user_role()) <= 2, false);
$$;

comment on function gbm_can_manage_portfolio is
  'OWNER and EXECUTIVE_DIRECTOR (and legacy ADMIN). Manages the GBM portfolio and represented players.';

-- Staff administration is the owner's alone.
create or replace function gbm_can_manage_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(gbm_current_user_role() = 'OWNER', false);
$$;

-- Guardian and consent data for minors. Management only — a scout doing
-- ordinary discovery work has no reason to hold a child's contact details.
create or replace function gbm_can_view_guardian_data()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(gbm_role_rank(gbm_current_user_role()) <= 2, false);
$$;

comment on function gbm_can_view_guardian_data is
  'OWNER and EXECUTIVE_DIRECTOR only. Enforced by RLS on player_guardians, not by hiding a component.';

-- ----------------------------------------------------------------------------
-- B. The GBM portfolio
-- ----------------------------------------------------------------------------
do $$ begin
  create type gbm_portfolio_status as enum (
    'REPRESENTED',    -- GBM represents this player today
    'IN_DISCUSSION',  -- talks under way, not signed
    'FORMER',         -- represented once, no longer
    'REVIEW_QUEUE'    -- named internally, representation not yet verified
  );
exception when duplicate_object then null; end $$;

create table if not exists gbm_portfolio (
  player_id            uuid primary key references players(id) on delete cascade,
  status               gbm_portfolio_status not null default 'REVIEW_QUEUE',
  representation_start date,
  representation_end   date,
  assigned_staff_id    uuid references auth.users(id) on delete set null,
  -- How GBM knows. A provider assertion, an internal record, or a person.
  verification_note    text,
  verified_by          uuid references auth.users(id) on delete set null,
  verified_at          timestamptz,
  notes                text,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table gbm_portfolio is
  'GBM''s own representation record — the authoritative portfolio. Provider assertions live in representation_records; an external source omitting a player is not evidence and never removes a row here.';

create index if not exists idx_gbm_portfolio_status on gbm_portfolio (status);
create index if not exists idx_gbm_portfolio_staff  on gbm_portfolio (assigned_staff_id);

drop trigger if exists gbm_portfolio_touch on gbm_portfolio;
create trigger gbm_portfolio_touch before update on gbm_portfolio
  for each row execute function gbm_touch_updated_at();

alter table gbm_portfolio enable row level security;

drop policy if exists gbm_portfolio_read on gbm_portfolio;
create policy gbm_portfolio_read on gbm_portfolio
  for select to authenticated using (gbm_is_member());

drop policy if exists gbm_portfolio_write on gbm_portfolio;
create policy gbm_portfolio_write on gbm_portfolio
  for all to authenticated
  using (gbm_can_manage_portfolio())
  with check (gbm_can_manage_portfolio());

-- ----------------------------------------------------------------------------
-- C. Guardians — minors
-- ----------------------------------------------------------------------------
create table if not exists player_guardians (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid not null references players(id) on delete cascade,
  guardian_name     text not null,
  relationship      text,
  contact_email     text,
  contact_phone     text,
  -- Reference to the signed document, never the document contents.
  consent_reference text,
  consent_on_file   boolean not null default false,
  notes             text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table player_guardians is
  'Guardian and consent details for players under 18. Readable only by OWNER and EXECUTIVE_DIRECTOR — see docs/YOUTH_AND_MINORS.md.';

create index if not exists idx_player_guardians_player on player_guardians (player_id);

drop trigger if exists player_guardians_touch on player_guardians;
create trigger player_guardians_touch before update on player_guardians
  for each row execute function gbm_touch_updated_at();

alter table player_guardians enable row level security;

-- Both sides gated: a scout can neither read nor write these rows.
drop policy if exists player_guardians_read on player_guardians;
create policy player_guardians_read on player_guardians
  for select to authenticated using (gbm_can_view_guardian_data());

drop policy if exists player_guardians_write on player_guardians;
create policy player_guardians_write on player_guardians
  for all to authenticated
  using (gbm_can_view_guardian_data())
  with check (gbm_can_view_guardian_data());

-- ----------------------------------------------------------------------------
-- D. The hourly layer
-- ----------------------------------------------------------------------------
create table if not exists player_news (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  headline      text not null,
  summary       text,
  source_name   text not null,
  source_url    text,
  -- Where it came from, so a claim can always be traced back.
  source_type   text not null check (source_type in (
                  'OFFICIAL_CLUB','FEDERATION','PROVIDER_API','RSS','DATASET','MANUAL')),
  category      text check (category in (
                  'TRANSFER','INJURY','CONTRACT','CALL_UP','SUSPENSION',
                  'CLUB_ANNOUNCEMENT','MATCH_PERFORMANCE','REPRESENTATION','OTHER')),
  language      text,
  published_at  timestamptz,
  discovered_at timestamptz not null default now(),
  confidence    numeric(4,3),
  -- Same story seen twice is one row: the hash is the natural key.
  content_hash  text not null,
  unique (player_id, content_hash)
);

comment on table player_news is
  'Sourced events about tracked players. Every row names where it came from; content_hash makes re-checking idempotent.';

create index if not exists idx_player_news_player_time
  on player_news (player_id, published_at desc nulls last);

alter table player_news enable row level security;

drop policy if exists player_news_read on player_news;
create policy player_news_read on player_news
  for select to authenticated using (gbm_is_member());

drop policy if exists player_news_write on player_news;
create policy player_news_write on player_news
  for all to authenticated
  using (gbm_can_write()) with check (gbm_can_write());

create table if not exists player_live_status (
  player_id        uuid primary key references players(id) on delete cascade,
  latest_match_id  uuid references matches(id) on delete set null,
  latest_match_at  timestamptz,
  latest_opponent  text,
  latest_result    text,
  latest_minutes   integer,
  latest_started   boolean,
  latest_goals     integer,
  latest_assists   integer,
  next_match_at    timestamptz,
  next_opponent    text,
  squad_status     text,
  availability     text,
  -- Scheduling state for the hourly job: when it last looked, and the earliest
  -- it is worth looking again. This is what keeps an hourly cadence cheap.
  last_checked_at  timestamptz,
  next_check_after timestamptz,
  check_count      integer not null default 0,
  source           text,
  updated_at       timestamptz not null default now()
);

comment on table player_live_status is
  'Per-player live snapshot plus the hourly job''s own scheduling state. next_check_after is why an hourly job does not mean an hourly API call.';

create index if not exists idx_player_live_next_check
  on player_live_status (next_check_after nulls first);

drop trigger if exists player_live_status_touch on player_live_status;
create trigger player_live_status_touch before update on player_live_status
  for each row execute function gbm_touch_updated_at();

alter table player_live_status enable row level security;

drop policy if exists player_live_status_read on player_live_status;
create policy player_live_status_read on player_live_status
  for select to authenticated using (gbm_is_member());

drop policy if exists player_live_status_write on player_live_status;
create policy player_live_status_write on player_live_status
  for all to authenticated
  using (gbm_can_write()) with check (gbm_can_write());

-- ----------------------------------------------------------------------------
-- E. Add Player — members could read `players` and nothing else.
-- ----------------------------------------------------------------------------
drop policy if exists players_manage on players;
create policy players_manage on players
  for all to authenticated
  using (gbm_can_manage_portfolio())
  with check (gbm_can_manage_portfolio());

-- Clubs may need creating alongside a manually added player.
drop policy if exists clubs_manage on clubs;
create policy clubs_manage on clubs
  for all to authenticated
  using (gbm_can_manage_portfolio())
  with check (gbm_can_manage_portfolio());

-- ----------------------------------------------------------------------------
-- F. GBM-owned imagery, kept separate from the provider portrait
-- ----------------------------------------------------------------------------
alter table players
  add column if not exists gbm_portrait_url text,
  add column if not exists gbm_hero_image_url text,
  add column if not exists image_credit text;

comment on column players.gbm_hero_image_url is
  'Action/hero image GBM holds rights to. Never a scraped image; see docs/PLAYER_IMAGES.md.';

-- ----------------------------------------------------------------------------
-- G. The portfolio surface, read in one query
-- ----------------------------------------------------------------------------
create or replace view v_gbm_portfolio with (security_invoker = on) as
select
  gp.player_id,
  gp.status,
  gp.representation_start,
  gp.representation_end,
  gp.assigned_staff_id,
  prof.full_name  as assigned_staff_name,
  gp.verification_note,
  gp.verified_at,
  gp.notes,
  p.full_name,
  p.date_of_birth,
  round(extract(epoch from age(current_date, p.date_of_birth)) / 31557600.0, 1) as age,
  (p.date_of_birth is not null
     and p.date_of_birth > current_date - interval '18 years') as is_minor,
  p.primary_position,
  p.height_cm,
  p.foot,
  nat.name as nationality,
  c.name   as club_name,
  p.cached_league          as league_name,
  p.cached_market_value    as market_value,
  p.cached_value_change_pct as value_change_12m_pct,
  p.cached_contract_expires as contract_expires_on,
  case when p.cached_contract_expires is not null
       then round((p.cached_contract_expires - current_date)::numeric / 30.44) end
    as contract_months_remaining,
  coalesce(p.gbm_hero_image_url, p.gbm_portrait_url, p.image_url) as hero_image_url,
  coalesce(p.gbm_portrait_url, p.image_url) as portrait_url,
  p.caches_refreshed_at,
  ls.latest_match_at,
  ls.latest_opponent,
  ls.latest_result,
  ls.latest_minutes,
  ls.latest_goals,
  ls.latest_assists,
  ls.next_match_at,
  ls.next_opponent,
  ls.availability,
  ls.last_checked_at,
  (select count(*) from player_news n
    where n.player_id = gp.player_id
      and n.discovered_at > now() - interval '7 days') as news_last_7d
from gbm_portfolio gp
join players p on p.id = gp.player_id
left join profiles prof on prof.id = gp.assigned_staff_id
left join countries nat on nat.id = p.nationality_country_id
left join clubs c on c.id = p.current_club_id
left join player_live_status ls on ls.player_id = gp.player_id;

comment on view v_gbm_portfolio is
  'One row per portfolio player: identity, club, value, contract, assigned staff, live match state and freshness. Guardian data is deliberately absent — it lives behind its own policy.';

grant select on v_gbm_portfolio to authenticated;
