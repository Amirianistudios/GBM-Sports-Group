-- ============================================================================
-- GBM INTELLIGENCE — 0005 ROW LEVEL SECURITY & PROVIDER SEED
-- ----------------------------------------------------------------------------
-- This is an internal platform. There is no public player database.
-- Baseline: you must be an authenticated organization member to read anything.
-- Writes to football data are service-role only (ingestion); writes to the GBM
-- workspace are allowed for SCOUT/ANALYST/ADMIN/OWNER.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enable RLS everywhere. Any table with RLS on and no policy denies all access
-- to anon/authenticated by default, which is the behaviour we want for the
-- ingestion-owned tables (service role bypasses RLS).
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'data_providers','provider_fact_priority','countries',
    'competitions','competition_external_ids','seasons','season_external_ids',
    'clubs','club_external_ids','club_aliases',
    'players','player_aliases','player_external_ids','player_team_history',
    'matches','match_external_ids','player_season_stats','player_match_stats',
    'transfers','contracts','market_values','representation_records',
    'player_injuries','player_national_team_records',
    'source_records','source_facts',
    'ingestion_jobs','ingestion_runs','ingestion_errors',
    'entity_resolution_candidates','entity_resolution_reviews','entity_resolution_rules',
    'organizations','profiles','organization_members',
    'watchlists','watchlist_players','player_notes','tags','player_tags',
    'scouting_reports','scouting_report_sections','scout_player_ratings',
    'player_events','discovery_signals','player_percentiles','player_rankings','alerts'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- READ ACCESS — every authenticated org member can read the football corpus
-- and the shared intelligence output.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'data_providers','provider_fact_priority','countries',
    'competitions','competition_external_ids','seasons','season_external_ids',
    'clubs','club_external_ids','club_aliases',
    'players','player_aliases','player_external_ids','player_team_history',
    'matches','match_external_ids','player_season_stats','player_match_stats',
    'transfers','contracts','market_values','representation_records',
    'player_injuries','player_national_team_records',
    'source_records','source_facts',
    'ingestion_jobs','ingestion_runs','ingestion_errors',
    'entity_resolution_candidates','entity_resolution_reviews','entity_resolution_rules',
    'player_events','discovery_signals','player_percentiles','player_rankings',
    'tags','organizations'
  ]
  loop
    execute format($f$
      create policy "members can read" on public.%I
        for select to authenticated
        using (gbm_is_member())
    $f$, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- PROFILES & MEMBERSHIP
-- ----------------------------------------------------------------------------
create policy "read own profile and teammates" on profiles
  for select to authenticated
  using (id = auth.uid() or gbm_is_member());

create policy "update own profile" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "read own membership" on organization_members
  for select to authenticated
  using (user_id = auth.uid() or gbm_is_member());

create policy "admins manage membership" on organization_members
  for all to authenticated
  using (gbm_current_user_role() in ('OWNER', 'ADMIN'))
  with check (gbm_current_user_role() in ('OWNER', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- WATCHLISTS — shared lists readable by all members; private lists owner-only.
-- ----------------------------------------------------------------------------
create policy "read watchlists" on watchlists
  for select to authenticated
  using (gbm_is_member() and (is_shared or created_by = auth.uid()));

create policy "write watchlists" on watchlists
  for all to authenticated
  using (gbm_can_write() and (is_shared or created_by = auth.uid()))
  with check (gbm_can_write());

create policy "read watchlist players" on watchlist_players
  for select to authenticated
  using (
    exists (
      select 1 from watchlists w
      where w.id = watchlist_players.watchlist_id
        and (w.is_shared or w.created_by = auth.uid())
    )
    and gbm_is_member()
  );

create policy "write watchlist players" on watchlist_players
  for all to authenticated
  using (gbm_can_write())
  with check (gbm_can_write());

-- ----------------------------------------------------------------------------
-- NOTES — private notes are visible only to their author.
-- ----------------------------------------------------------------------------
create policy "read notes" on player_notes
  for select to authenticated
  using (gbm_is_member() and (not is_private or author_id = auth.uid()));

create policy "write own notes" on player_notes
  for all to authenticated
  using (gbm_can_write() and (author_id = auth.uid() or gbm_current_user_role() in ('OWNER','ADMIN')))
  with check (gbm_can_write());

-- ----------------------------------------------------------------------------
-- SCOUTING REPORTS — drafts are private to their scout until published.
-- ----------------------------------------------------------------------------
create policy "read reports" on scouting_reports
  for select to authenticated
  using (gbm_is_member() and (not is_draft or scout_id = auth.uid()));

create policy "write own reports" on scouting_reports
  for all to authenticated
  using (gbm_can_write() and (scout_id = auth.uid() or gbm_current_user_role() in ('OWNER','ADMIN')))
  with check (gbm_can_write());

create policy "read report sections" on scouting_report_sections
  for select to authenticated
  using (
    exists (
      select 1 from scouting_reports r
      where r.id = scouting_report_sections.report_id
        and (not r.is_draft or r.scout_id = auth.uid())
    )
  );

create policy "write report sections" on scouting_report_sections
  for all to authenticated
  using (gbm_can_write())
  with check (gbm_can_write());

create policy "read ratings" on scout_player_ratings
  for select to authenticated using (gbm_is_member());

create policy "write own ratings" on scout_player_ratings
  for all to authenticated
  using (gbm_can_write() and scout_id = auth.uid())
  with check (gbm_can_write());

-- ----------------------------------------------------------------------------
-- TAGS
-- ----------------------------------------------------------------------------
create policy "read player tags" on player_tags
  for select to authenticated using (gbm_is_member());

create policy "write player tags" on player_tags
  for all to authenticated
  using (gbm_can_write()) with check (gbm_can_write());

create policy "write tags" on tags
  for all to authenticated
  using (gbm_can_write()) with check (gbm_can_write());

-- ----------------------------------------------------------------------------
-- ALERTS — strictly per-user.
-- ----------------------------------------------------------------------------
create policy "read own alerts" on alerts
  for select to authenticated using (user_id = auth.uid());

create policy "update own alerts" on alerts
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- ENTITY RESOLUTION REVIEW — analysts and above may adjudicate matches.
-- ----------------------------------------------------------------------------
create policy "write resolution reviews" on entity_resolution_reviews
  for all to authenticated
  using (gbm_can_write()) with check (gbm_can_write());

create policy "update resolution candidates" on entity_resolution_candidates
  for update to authenticated
  using (gbm_can_write()) with check (gbm_can_write());

-- ============================================================================
-- PROVIDER SEED
-- ----------------------------------------------------------------------------
-- default_priority encodes general reliability; per-fact overrides follow.
-- ============================================================================
insert into data_providers (code, name, kind, homepage, default_priority, requires_credentials, notes) values
  ('WYSCOUT',              'Wyscout (Hudl)',          'API',      'https://apirest.wyscout.com',        95, true,  'Primary professional provider. Basic auth. v3. ~12 req/s.'),
  ('TRANSFERMARKT',        'Transfermarkt',           'SCRAPE',   'https://www.transfermarkt.com',      85, false, 'Market values, contracts, agency/representation, transfers.'),
  ('TRANSFERMARKT_DATASET','Transfermarkt Datasets',  'DATASET',  'https://github.com/dcaribou/transfermarkt-datasets', 80, false, 'Weekly refreshed CSV/DuckDB mirror of Transfermarkt. Public R2 bucket, no auth.'),
  ('REEP',                 'Reep Football Register',  'REGISTRY', 'https://reep.football',              90, true,  'Cross-provider canonical identity register. CC0 Wikidata-derived. Bootstraps entity resolution.'),
  ('BESOCCER',             'BeSoccer',                'API',      'https://api.besoccer.com/en',        65, true,  'Profiles, matches, lineups, transfers, injuries.'),
  ('SOFASCORE',            'Sofascore',               'SCRAPE',   'https://www.sofascore.com',          70, false, 'Ratings, heatmaps, shotmaps, season statistics.'),
  ('FOTMOB',               'FotMob',                  'SCRAPE',   'https://www.fotmob.com',             68, false, 'xG, shotmaps, ratings, injuries, form.'),
  ('SPORTDB',              'SportDB',                 'API',      'https://sportdb.dev',                55, true,  'Experimental connector.'),
  ('FBREF',                'FBref (Sports Reference)','SCRAPE',   'https://fbref.com',                  75, false, 'Opta-derived advanced stats, strong for progressive actions.'),
  ('UNDERSTAT',            'Understat',               'SCRAPE',   'https://understat.com',              60, false, 'xG/xA for top-5 leagues.'),
  ('STATSBOMB',            'StatsBomb Open Data',     'DATASET',  'https://github.com/statsbomb/open-data', 70, false, 'Free event data for selected competitions.'),
  ('SPORTMONKS',           'SportMonks',              'API',      'https://www.sportmonks.com',         60, true,  'Commercial API. Not yet subscribed.'),
  ('API_FOOTBALL',         'API-Football',            'API',      'https://www.api-football.com',       55, true,  'Broad coverage, moderate depth.'),
  ('IMPECT',               'IMPECT',                  'API',      'https://www.impect.com',             70, true,  'Packing / advanced possession value metrics.'),
  ('WIKIDATA',             'Wikidata',                'REGISTRY', 'https://www.wikidata.org',           50, false, 'Underlies Reep. Useful for identity bridging.'),
  ('FEDERATION',           'National Federation',     'SCRAPE',   null,                                 88, false, 'Official squad/registration data. Authoritative where available.'),
  ('CLUB',                 'Club Official Source',    'SCRAPE',   null,                                 88, false, 'Official club announcements and squad pages.'),
  ('GBM_INTERNAL',         'GBM Internal Knowledge',  'INTERNAL', null,                                100, false, 'GBM scout observation and verified internal knowledge. Outranks all external sources.')
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- Fact-specific trust. Deliberately different per fact: no provider is best at
-- everything, and encoding one global winner would be wrong.
-- ----------------------------------------------------------------------------
insert into provider_fact_priority (provider_code, fact_key, priority) values
  -- Match & season statistics: Wyscout is the professional feed.
  ('WYSCOUT',              'player.stats',          100),
  ('FBREF',                'player.stats',           80),
  ('SOFASCORE',            'player.stats',           70),
  ('FOTMOB',               'player.stats',           65),
  -- Market value: Transfermarkt is the market reference.
  ('TRANSFERMARKT',        'player.market_value',   100),
  ('TRANSFERMARKT_DATASET','player.market_value',    95),
  -- Representation: Transfermarkt is the only broad public source, but GBM's
  -- own verification always outranks it.
  ('GBM_INTERNAL',         'player.representation', 100),
  ('TRANSFERMARKT',        'player.representation',  80),
  -- Contract: Transfermarkt breadth, Wyscout where the account exposes it.
  ('TRANSFERMARKT',        'player.contract',        90),
  ('WYSCOUT',              'player.contract',        85),
  ('GBM_INTERNAL',         'player.contract',       100),
  -- Biographical identity: federations and clubs are authoritative.
  ('FEDERATION',           'player.date_of_birth',  100),
  ('CLUB',                 'player.date_of_birth',   95),
  ('WYSCOUT',              'player.date_of_birth',   90),
  ('TRANSFERMARKT',        'player.date_of_birth',   85),
  ('REEP',                 'player.date_of_birth',   80),
  -- Physical attributes: providers disagree constantly; Wyscout measured data
  -- is preferred but conflicts are always surfaced.
  ('WYSCOUT',              'player.height_cm',       90),
  ('TRANSFERMARKT',        'player.height_cm',       80),
  -- Squad membership: the club itself is the truth.
  ('CLUB',                 'player.current_club',   100),
  ('FEDERATION',           'player.current_club',    95),
  ('WYSCOUT',              'player.current_club',    90),
  ('TRANSFERMARKT',        'player.current_club',    85)
on conflict (provider_code, fact_key) do nothing;

-- ----------------------------------------------------------------------------
-- Ingestion job registry.
-- ----------------------------------------------------------------------------
insert into ingestion_jobs (key, name, provider_code, description, schedule_cron) values
  ('wyscout_competition_sync', 'Wyscout competition & season sync', 'WYSCOUT',   'Refresh competitions, seasons and teams from Wyscout.', '0 3 * * 1'),
  ('wyscout_squad_sync',       'Wyscout squad sync',                'WYSCOUT',   'Refresh squads and player profiles for tracked teams.', '0 4 * * *'),
  ('wyscout_stats_sync',       'Wyscout advanced stats sync',       'WYSCOUT',   'Refresh player season advanced statistics.', '0 5 * * *'),
  ('transfermarkt_dataset_update', 'Transfermarkt dataset refresh', 'TRANSFERMARKT_DATASET', 'Download and import the weekly Transfermarkt dataset release.', '0 2 * * 2'),
  ('market_value_sync',        'Market value sync',                 'TRANSFERMARKT', 'Refresh current and historical market values.', '0 6 * * *'),
  ('representation_sync',      'Representation sync',               'TRANSFERMARKT', 'Refresh agency/representation status and detect changes.', '0 7 * * *'),
  ('contract_sync',            'Contract sync',                     'TRANSFERMARKT', 'Refresh contract expiry information.', '0 7 * * *'),
  ('reep_register_sync',       'Reep register sync',                'REEP',      'Download the Reep canonical register and refresh identity mappings.', '0 1 * * 1'),
  ('entity_resolution',        'Entity resolution pass',            null,        'Resolve unmatched provider identities against canonical players.', '0 8 * * *'),
  ('discovery_signals',        'Talent discovery signal computation', null,      'Recompute percentiles and discovery signals.', '0 9 * * *'),
  ('change_detection',         'Change detection',                  null,        'Diff current state against previous and emit player_events.', '0 10 * * *'),
  ('data_quality',             'Data quality audit',                null,        'Detect conflicts, stale records and unresolved identities.', '0 11 * * *')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Default organisation. The first user to sign up is attached to this.
-- ----------------------------------------------------------------------------
insert into organizations (name, slug) values ('GBM Sports Group', 'gbm')
on conflict (slug) do nothing;
