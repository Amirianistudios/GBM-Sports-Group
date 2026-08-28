-- ============================================================================
-- GBM INTELLIGENCE — 0043 CAPTURE THE OBJECTS THAT WERE NEVER COMMITTED
-- ----------------------------------------------------------------------------
-- CLAUDE.md says GitHub is the source of truth for the application. It stopped
-- being true. Sixty-four migrations are recorded in the database against
-- forty-one files in `supabase/migrations/`, and twenty objects exist in
-- production that no repo file creates:
--
--   tables     claude_agent_secrets, club_recruitment_profiles,
--              intel_ops_board, recruitment_matches, sofascore_tournaments,
--              staging_ingest
--   view       v_claude_candidates
--   functions  claude_compute_percentiles, claude_flag_tm_club_mismatch,
--              claude_invalidate_bad_tm_matches, claude_tm_queue,
--              claude_write_reports, gbm_find_club, gbm_match_profile,
--              gbm_merge_club, gbm_merge_player, gbm_norm,
--              gbm_parse_tm_value, ingest_sofascore_batch,
--              ingest_tm_agent_batch, ingest_tm_profile_batch
--
-- Most came from a parallel session that built the SofaScore/Transfermarkt
-- ingestion straight against production; three came from earlier work in this
-- repo that was applied and never written down. A rebuild from
-- `supabase/migrations/` would have produced a database missing all of it,
-- and 0044 has to fix a set of security defects nobody had reviewed because
-- there was nothing to review.
--
-- This file is ordered BEFORE 0044 on purpose. 0044 revokes, alters and
-- pins sixteen objects that only this file creates, so on a rebuild from an
-- empty database it fails on its first statement unless the objects exist
-- first. That is also the true order of events: these objects were created
-- on 2026-08-28 around 10:21-10:51, and the hardening was applied at 11:29.
--
-- Every definition below is transcribed from the live catalog —
-- `pg_get_functiondef`, `pg_get_viewdef`, `pg_get_constraintdef` — not written
-- from memory. The whole file is idempotent, so re-applying it to the
-- database it was captured from is a no-op, which is how it was verified.
--
-- THE GRANTS ARE NARROWED, AND WHY THAT IS HYGIENE RATHER THAN A FIX
--
-- The captured tables carried the full default DML grant to `anon` and
-- `authenticated`, with RLS relied on to deny whatever the policies do not
-- allow. That reasoning holds for SELECT, INSERT, UPDATE and DELETE. It does
-- not hold for TRUNCATE, which is not a row operation and is never filtered
-- by a policy — so on paper `anon` could empty `staging_ingest` and any
-- signed-in user could empty `sofascore_tournaments` with every policy on
-- those tables working exactly as intended.
--
-- On paper. Before treating that as a live hole, check the two things that
-- would have to be true, because both are false:
--
--   * PostgREST exposes no TRUNCATE. The API surface is select/insert/update/
--     delete on tables and views plus RPC on functions, so there is no request
--     that reaches it.
--   * `anon` and `authenticated` are NOLOGIN roles. PostgREST reaches them
--     with SET ROLE on its own connection; nobody can open a session as one.
--
-- And the grant is not this pipeline's doing: it is Supabase's schema-wide
-- default, held on 71 tables by `anon` and 76 by `authenticated` — `players`
-- and `source_records` included. Narrowing it on six tables would not change
-- that, and a migration that claimed to have closed a hole would be wrong.
--
-- So the grants below are written to what each table actually needs, as
-- hygiene, and the guard checks only these six. Revoking the default across
-- all 76 is a separate decision for GBM to take deliberately, with the API
-- re-tested afterwards — not something to slip into a capture.
--
-- KNOWN DEFECTS IN THE CAPTURED CODE, RECORDED NOT FIXED
--
-- Capturing is not endorsing, and silently rewriting a working pipeline while
-- transcribing it is how a capture introduces a bug. Two things to look at
-- before this code is trusted further:
--
--   * `gbm_merge_player` handles a unique_violation while re-pointing a child
--     row by DELETING the duplicate's row instead of merging it. On a merge
--     that is silent data loss, not a conflict resolution.
--   * `claude_write_reports` records a model identifier in `intel_reports`
--     and labels its output rule-assisted. That string is provenance written
--     by the agent that produced the reports; it is captured verbatim because
--     changing it would misattribute 148 existing rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table if not exists claude_agent_secrets (
  name text not null,
  secret text not null,
  created_at timestamp with time zone default now(),
  constraint claude_agent_secrets_pkey primary key (name)
);

create table if not exists sofascore_tournaments (
  tournament_id integer not null,
  name text not null,
  country_name text,
  tier competition_tier default 'UNKNOWN'::competition_tier not null,
  is_youth boolean default false,
  competition_id uuid,
  constraint sofascore_tournaments_pkey primary key (tournament_id),
  constraint sofascore_tournaments_competition_id_fkey
    foreign key (competition_id) references competitions(id)
);

create table if not exists staging_ingest (
  id uuid default gen_random_uuid() not null,
  source text not null,
  batch_code text not null,
  tournament_id integer,
  season_id integer,
  payload jsonb not null,
  collected_by text default 'CLAUDE_COWORK'::text,
  created_at timestamp with time zone default now(),
  processed_at timestamp with time zone,
  constraint staging_ingest_pkey primary key (id)
);

create index if not exists staging_ingest_batch_idx on staging_ingest using btree (batch_code);

create table if not exists club_recruitment_profiles (
  id uuid default gen_random_uuid() not null,
  club_id uuid,
  country_id uuid,
  competition_id uuid,
  "position" text,
  tactical_role text,
  age_min integer,
  age_max integer,
  max_transfer_eur bigint,
  max_salary_eur bigint,
  contract_prefs text[] default '{}'::text[] not null,
  nationality_rule text,
  competition_level text,
  starter_vs_project text,
  keywords text[] default '{}'::text[] not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint club_recruitment_profiles_pkey primary key (id),
  constraint club_recruitment_profiles_club_id_fkey foreign key (club_id) references clubs(id),
  constraint club_recruitment_profiles_competition_id_fkey foreign key (competition_id) references competitions(id),
  constraint club_recruitment_profiles_country_id_fkey foreign key (country_id) references countries(id),
  constraint club_recruitment_profiles_created_by_fkey foreign key (created_by) references auth.users(id),
  constraint club_recruitment_profiles_age_min_check
    check ((age_min is null) or (age_min >= 15 and age_min <= 45)),
  constraint club_recruitment_profiles_age_max_check
    check ((age_max is null) or (age_max >= 15 and age_max <= 45)),
  constraint club_recruitment_profiles_check
    check ((age_min is null) or (age_max is null) or (age_min <= age_max)),
  constraint club_recruitment_profiles_starter_vs_project_check
    check ((starter_vs_project is null)
           or (starter_vs_project = any (array['STARTER'::text,'PROJECT'::text,'EITHER'::text])))
);

create table if not exists recruitment_matches (
  id uuid default gen_random_uuid() not null,
  profile_id uuid not null,
  player_id uuid not null,
  overall numeric not null,
  technical numeric,
  statistical numeric,
  financial numeric,
  market_adaptation numeric,
  risk numeric,
  recommendation_one_liner text not null,
  recommendation recommendation,
  missing_fields text[] default '{}'::text[] not null,
  confidence numeric,
  explanation jsonb default '{}'::jsonb not null,
  scores_are_ai boolean default true not null,
  verified_by uuid,
  verified_at timestamp with time zone,
  computed_at timestamp with time zone default now() not null,
  constraint recruitment_matches_pkey primary key (id),
  constraint recruitment_matches_profile_id_fkey
    foreign key (profile_id) references club_recruitment_profiles(id) on delete cascade,
  constraint recruitment_matches_player_id_fkey foreign key (player_id) references players(id),
  constraint recruitment_matches_verified_by_fkey foreign key (verified_by) references auth.users(id),
  constraint recruitment_matches_profile_id_player_id_key unique (profile_id, player_id),
  constraint recruitment_matches_overall_check check (overall >= 0 and overall <= 100),
  constraint recruitment_matches_technical_check check ((technical is null) or (technical >= 0 and technical <= 100)),
  constraint recruitment_matches_statistical_check check ((statistical is null) or (statistical >= 0 and statistical <= 100)),
  constraint recruitment_matches_financial_check check ((financial is null) or (financial >= 0 and financial <= 100)),
  constraint recruitment_matches_market_adaptation_check check ((market_adaptation is null) or (market_adaptation >= 0 and market_adaptation <= 100)),
  constraint recruitment_matches_risk_check check ((risk is null) or (risk >= 0 and risk <= 100)),
  constraint recruitment_matches_confidence_check check ((confidence is null) or (confidence >= 0 and confidence <= 1))
);

create table if not exists intel_ops_board (
  agent_code text not null,
  display_name text not null,
  mission text,
  status text default 'WAITING'::text not null,
  last_action text,
  sources_checked text[] default '{}'::text[] not null,
  data_collected text,
  pending_decisions text,
  errors_limits text,
  last_activity_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint intel_ops_board_pkey primary key (agent_code),
  constraint intel_ops_board_status_check
    check (status = any (array['WORKING'::text,'WAITING'::text,'COMPLETED'::text,'BLOCKED'::text]))
);

-- ----------------------------------------------------------------------------
-- Row level security
-- ----------------------------------------------------------------------------
alter table claude_agent_secrets      enable row level security;
alter table sofascore_tournaments     enable row level security;
alter table staging_ingest            enable row level security;
alter table club_recruitment_profiles enable row level security;
alter table recruitment_matches       enable row level security;
alter table intel_ops_board           enable row level security;

-- `claude_agent_secrets` deliberately carries no policy. RLS with no policy
-- denies every role that is not the owner, which is the whole intent: the
-- table is reachable only from inside a SECURITY DEFINER function.

drop policy if exists "members can read" on sofascore_tournaments;
create policy "members can read" on sofascore_tournaments
  for select to authenticated using ((select gbm_is_member()));

drop policy if exists "members can read" on recruitment_matches;
create policy "members can read" on recruitment_matches
  for select to authenticated using ((select gbm_is_member()));

drop policy if exists "members can read" on intel_ops_board;
create policy "members can read" on intel_ops_board
  for select to authenticated using ((select gbm_is_member()));

drop policy if exists "members can read" on club_recruitment_profiles;
create policy "members can read" on club_recruitment_profiles
  for select to authenticated using ((select gbm_is_member()));

drop policy if exists "portfolio managers write profiles" on club_recruitment_profiles;
create policy "portfolio managers write profiles" on club_recruitment_profiles
  for insert to authenticated with check ((select gbm_can_manage_portfolio()));

drop policy if exists "portfolio managers update profiles" on club_recruitment_profiles;
create policy "portfolio managers update profiles" on club_recruitment_profiles
  for update to authenticated
  using ((select gbm_can_manage_portfolio()))
  with check ((select gbm_can_manage_portfolio()));

drop policy if exists "portfolio managers delete profiles" on club_recruitment_profiles;
create policy "portfolio managers delete profiles" on club_recruitment_profiles
  for delete to authenticated using ((select gbm_can_manage_portfolio()));

-- The external scraper's drop-box: an unauthenticated INSERT, restricted to
-- the three sources it collects. anon cannot read back, update or delete
-- through it, and 0044 records the decision to keep it rather than break a
-- running collection.
drop policy if exists "staging_ingest_anon_insert" on staging_ingest;
create policy "staging_ingest_anon_insert" on staging_ingest
  for insert to anon
  with check (source = any (array['SOFASCORE'::text,'TRANSFERMARKT'::text,'FOTMOB'::text]));

-- ----------------------------------------------------------------------------
-- Grants — narrowed, because TRUNCATE is never filtered by a policy
-- ----------------------------------------------------------------------------
revoke all on table claude_agent_secrets      from public, anon, authenticated;
revoke all on table sofascore_tournaments     from public, anon, authenticated;
revoke all on table staging_ingest            from public, anon, authenticated;
revoke all on table club_recruitment_profiles from public, anon, authenticated;
revoke all on table recruitment_matches       from public, anon, authenticated;
revoke all on table intel_ops_board           from public, anon, authenticated;
revoke all on table v_claude_candidates       from public, anon, authenticated;

grant select on table sofascore_tournaments to authenticated;
grant select on table recruitment_matches   to authenticated;
grant select on table intel_ops_board       to authenticated;
grant select on table v_claude_candidates   to authenticated;
grant select, insert, update, delete on table club_recruitment_profiles to authenticated;
grant insert on table staging_ingest to anon;
grant select, insert on table staging_ingest to authenticated;

-- ----------------------------------------------------------------------------
-- The candidate view
-- ----------------------------------------------------------------------------
-- security_invoker matters here more than anywhere: the view exposes name,
-- date of birth, nationality, market value and agency for every player it
-- covers. As a definer view — which is how it was created — `anon` read all
-- of it. This file is where the setting lives, and 0044 re-asserts it.
create or replace view v_claude_candidates
with (security_invoker = on) as
with s as (
  select ps.*,
         (ps.advanced ->> 'rating')::numeric as rating,
         ps.advanced ->> 'batch' as batch,
         c.name as comp_name,
         c.tier,
         co.name as comp_country,
         se.name as season_name,
         se.is_current as season_current
    from player_season_stats ps
    join competitions c on c.id = ps.competition_id
    left join countries co on co.id = c.country_id
    join seasons se on se.id = ps.season_id
   where ps.provider_code = 'SOFASCORE'
), z as (
  select s.*,
         p.full_name,
         p.date_of_birth,
         extract(year from age(current_date::timestamptz, p.date_of_birth::timestamptz))::int as age_years,
         round(extract(epoch from age(current_date::timestamptz, p.date_of_birth::timestamptz)) / 31557600.0, 1) as age,
         p.primary_position as pos,
         p.foot,
         p.height_cm,
         nat.name as nationality,
         nat.iso3 as nat_iso3,
         cl.name as club_name,
         p.gbm_status,
         p.id as pid,
         avg(s.rating) over (partition by s.competition_id, s.season_id, p.primary_position) as comp_pos_avg,
         stddev(s.rating) over (partition by s.competition_id, s.season_id, p.primary_position) as comp_pos_sd,
         (select ct.expires_on from contracts ct
           where ct.player_id = p.id order by ct.retrieved_at desc limit 1) as contract_expires,
         (select mv.value_amount from market_values mv
           where mv.player_id = p.id
           order by mv.valued_on desc,
                    (case mv.provider_code when 'TRANSFERMARKT' then 0 else 1 end),
                    mv.retrieved_at desc
           limit 1) as market_value,
         (select rr.status::text from representation_records rr
           where rr.player_id = p.id and rr.is_current
           order by rr.retrieved_at desc limit 1) as rep_status,
         (select rr.agency_name from representation_records rr
           where rr.player_id = p.id and rr.is_current
           order by rr.retrieved_at desc limit 1) as agency,
         (select e.url from player_external_ids e
           where e.player_id = p.id and e.provider_code = 'SOFASCORE' limit 1) as sofascore_url,
         (select e.url from player_external_ids e
           where e.player_id = p.id and e.provider_code = 'TRANSFERMARKT' limit 1) as transfermarkt_url
    from s
    join players p on p.id = s.player_id
    left join countries nat on nat.id = p.nationality_country_id
    left join clubs cl on cl.id = s.club_id
)
select pid as player_id,
       full_name, age, date_of_birth, nationality, nat_iso3, pos, foot, height_cm,
       club_name, comp_name, comp_country, tier, season_name, season_current, batch,
       matches_played as apps,
       minutes_played as minutes,
       goals, assists,
       case when minutes_played > 0
            then round((goals + assists)::numeric * 90.0 / minutes_played::numeric, 2)
       end as ga_per90,
       rating,
       round((rating - comp_pos_avg) / nullif(comp_pos_sd, 0), 2) as rating_z,
       (advanced ->> 'pass_accuracy_pct')::numeric as pass_pct,
       key_passes,
       dribbles_successful,
       (advanced ->> 'duels_won_pct')::numeric as duel_pct,
       (advanced ->> 'aerial_won_pct')::numeric as aerial_pct,
       shots, shots_on_target,
       (advanced ->> 'big_chances_created')::int as big_chances_created,
       interceptions, tackles, clearances, goals_conceded, clean_sheets, saves, xg, xa,
       contract_expires, market_value, rep_status, agency, gbm_status,
       sofascore_url, transfermarkt_url,
       round(least(100, greatest(0,
         35
         + 12 * coalesce((rating - comp_pos_avg) / nullif(comp_pos_sd, 0), 0)
         + (case when age <= 19 then 20 when age <= 21 then 15 when age <= 23 then 8 else -30 end)::numeric
         + least(12, coalesce(minutes_played, 0)::numeric / 150.0)
         + (case when minutes_played > 0
                 then least(12, (goals + assists)::numeric * 90.0 / minutes_played::numeric * 12)
                 else 0 end)
         + (case when contract_expires is not null
                  and contract_expires <= (current_date + interval '10 months') then 8 else 0 end)::numeric
         + (case when rep_status = 'NO_AGENCY_LISTED' then 8
                 when rep_status is null or rep_status = 'UNKNOWN' then 3
                 else 0 end)::numeric
       )), 1) as claude_score
  from z;

-- ----------------------------------------------------------------------------
-- Helper functions
-- ----------------------------------------------------------------------------

create or replace function gbm_norm(t text)
returns text language sql immutable set search_path to 'public' as $function$
  select regexp_replace(lower(unaccent(coalesce(t,''))), '[^a-z0-9]+', ' ', 'g')
$function$;

create or replace function gbm_parse_tm_value(t text)
returns numeric language sql immutable set search_path to 'public' as $function$
  select case when t is null or t !~ '\d' then null
    when lower(t) ~ 'm' then round(replace(regexp_replace(t,'[^0-9.,]','','g'),',','.')::numeric*1000000)
    when lower(t) ~ 'k' then round(replace(regexp_replace(t,'[^0-9.,]','','g'),',','.')::numeric*1000)
    else replace(regexp_replace(t,'[^0-9.,]','','g'),',','.')::numeric end
$function$;

create or replace function gbm_find_club(p_name text, p_country uuid)
returns uuid language plpgsql stable set search_path to 'public' as $function$
declare v uuid; n text; toks text; begin
  n := gbm_normalize_name(p_name);
  select id into v from clubs where normalized_name=n limit 1;
  if v is not null then return v; end if;
  select club_id into v from club_aliases where normalized_alias=n limit 1;
  if v is not null then return v; end if;
  toks := coalesce((select string_agg(m[1],' ' order by m[1]) from regexp_matches(n,'\m(\d+|ii|iii|iv|b|u21|u23|u19|u18|u17|academy|reserves?|women|ladies)\M','g') m),'');
  select id into v from clubs c where c.country_id=p_country
    and similarity(replace(c.normalized_name,'fc ',''), replace(n,'fc ','')) > 0.62
    and coalesce((select string_agg(m[1],' ' order by m[1]) from regexp_matches(c.normalized_name,'\m(\d+|ii|iii|iv|b|u21|u23|u19|u18|u17|academy|reserves?|women|ladies)\M','g') m),'') = toks
    order by similarity(replace(c.normalized_name,'fc ',''), replace(n,'fc ','')) desc limit 1;
  return v;
end $function$;

create or replace function gbm_match_profile(p_profile_id uuid)
returns setof recruitment_matches
language sql stable security definer set search_path to 'public' as $function$
  select m.*
  from public.recruitment_matches m
  where m.profile_id = p_profile_id
    and (select gbm_is_member());
$function$;

create or replace function gbm_merge_club(p_dup uuid, p_keep uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_name text; begin
  if p_dup=p_keep then return; end if;
  select name into v_name from clubs where id=p_dup;
  update players set current_club_id=p_keep where current_club_id=p_dup;
  update player_season_stats set club_id=p_keep where club_id=p_dup;
  update player_team_history set club_id=p_keep where club_id=p_dup;
  update contracts set club_id=p_keep where club_id=p_dup;
  update market_values set club_id=p_keep where club_id=p_dup;
  update transfers set from_club_id=p_keep where from_club_id=p_dup;
  update transfers set to_club_id=p_keep where to_club_id=p_dup;
  update matches set home_club_id=p_keep where home_club_id=p_dup;
  update matches set away_club_id=p_keep where away_club_id=p_dup;
  update source_records set club_id=p_keep where club_id=p_dup;
  update club_recruitment_profiles set club_id=p_keep where club_id=p_dup;
  update recruitment_requests set club_id=p_keep where club_id=p_dup;
  update intel_recommendations set target_club_id=p_keep where target_club_id=p_dup;
  update entity_resolution_candidates set club_id=p_keep where club_id=p_dup;
  update club_external_ids set club_id=p_keep where club_id=p_dup;
  update club_aliases set club_id=p_keep where club_id=p_dup;
  insert into club_aliases(club_id, alias, source) values (p_keep, v_name, 'merge') ;
  delete from clubs where id=p_dup;
end $function$;

-- NOTE: the unique_violation branch DELETES the duplicate's child row rather
-- than merging it. Captured as it runs in production; see the header.
create or replace function gbm_merge_player(p_dup uuid, p_keep uuid)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare r record; n int:=0; v_name text; begin
  if p_dup=p_keep or p_dup is null or p_keep is null then return 0; end if;
  select full_name into v_name from players where id=p_dup;
  for r in
    select tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name
    where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and ccu.table_name='players' and ccu.column_name='id'
  loop
    begin
      execute format('update %I set %I=$1 where %I=$2', r.table_name, r.column_name, r.column_name) using p_keep, p_dup;
      get diagnostics n = row_count;
    exception when unique_violation then
      execute format('delete from %I where %I=$1', r.table_name, r.column_name) using p_dup;
    end;
  end loop;
  update players k set
    date_of_birth=coalesce(k.date_of_birth,d.date_of_birth), nationality_country_id=coalesce(k.nationality_country_id,d.nationality_country_id),
    height_cm=coalesce(k.height_cm,d.height_cm), foot=case when k.foot is null or k.foot='UNKNOWN' then d.foot else k.foot end,
    primary_position=coalesce(k.primary_position,d.primary_position), current_club_id=coalesce(k.current_club_id,d.current_club_id),
    image_url=coalesce(k.image_url,d.image_url), updated_at=now()
  from players d where k.id=p_keep and d.id=p_dup;
  insert into player_aliases(player_id,alias,alias_type,source_provider) select p_keep, v_name, 'MERGE', 'GBM_INTERNAL'
    where not exists (select 1 from player_aliases where player_id=p_keep and normalized_alias=gbm_normalize_name(v_name));
  delete from players where id=p_dup;
  return 1;
end $function$;

-- ----------------------------------------------------------------------------
-- Ingestion
-- ----------------------------------------------------------------------------

create or replace function ingest_sofascore_batch(p_batch text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  r record; p jsonb; v_tid int; v_sid int; v_season_name text;
  v_comp uuid; v_season uuid; v_country uuid; v_club uuid; v_player uuid; v_nat uuid;
  v_foot preferred_foot; v_pos text; v_created int:=0; v_matched int:=0; v_stats int:=0; v_clubs int:=0;
  v_is_current boolean; v_start date; v_end date; v_club_country uuid; v_url text;
begin
  select tournament_id, season_id into v_tid, v_sid from staging_ingest where batch_code=p_batch and source='SOFASCORE' limit 1;
  if v_tid is null then return jsonb_build_object('error','no rows'); end if;

  select competition_id into v_comp from sofascore_tournaments where tournament_id=v_tid;
  if v_comp is null then
    select id into v_country from countries where name=(select country_name from sofascore_tournaments where tournament_id=v_tid);
    insert into competitions(name, country_id, tier, gender, is_youth)
      select name, v_country, tier, 'MALE', is_youth from sofascore_tournaments where tournament_id=v_tid
      returning id into v_comp;
    update sofascore_tournaments set competition_id=v_comp where tournament_id=v_tid;
  end if;
  insert into competition_external_ids(competition_id, provider_code, namespace, external_id, url, confidence, verified_at)
    values (v_comp,'SOFASCORE','unique-tournament',v_tid::text,'https://www.sofascore.com/tournament/football/x/x/'||v_tid,0.95,now())
    on conflict (provider_code, namespace, external_id) do nothing;

  v_season_name := case when p_batch ~ '_(\d{2})(\d{2})$' then '20'||substring(p_batch from '_(\d{2})\d{2}$')||'/20'||substring(p_batch from '_\d{2}(\d{2})$')
                        else '2026' end;
  if v_season_name like '%/%' then
    v_start := (left(v_season_name,4)||'-07-01')::date; v_end := (right(v_season_name,4)||'-06-30')::date;
  else v_start := (v_season_name||'-01-01')::date; v_end := (v_season_name||'-12-31')::date; end if;
  v_is_current := current_date between v_start and v_end;
  select season_id into v_season from season_external_ids where provider_code='SOFASCORE' and external_id=v_sid::text;
  if v_season is null then
    select id into v_season from seasons where competition_id=v_comp and name=v_season_name;
    if v_season is null then
      insert into seasons(competition_id,name,start_date,end_date,is_current) values (v_comp,v_season_name,v_start,v_end,v_is_current) returning id into v_season;
    end if;
    insert into season_external_ids(season_id,provider_code,namespace,external_id,confidence) values (v_season,'SOFASCORE','season',v_sid::text,0.95) on conflict do nothing;
  end if;

  for r in select id, payload from staging_ingest where batch_code=p_batch and source='SOFASCORE' and processed_at is null loop
    p := r.payload;
    v_url := 'https://www.sofascore.com/football/player/'||coalesce(nullif(p->>'slug',''),'x')||'/'||(p->>'id');
    v_club := null;
    select club_id into v_club from club_external_ids where provider_code='SOFASCORE' and external_id=(p->>'teamId');
    if v_club is null then
      select id into v_club_country from countries where name=(select country_name from sofascore_tournaments where tournament_id=v_tid);
      v_club := gbm_find_club(p->>'team', v_club_country);
      if v_club is null then
        insert into clubs(name, short_name, country_id) values (p->>'team', p->>'team', v_club_country) returning id into v_club; v_clubs:=v_clubs+1;
      end if;
      insert into club_external_ids(club_id,provider_code,namespace,external_id,url,confidence,verified_at) values (v_club,'SOFASCORE','team',p->>'teamId','https://www.sofascore.com/team/football/x/'||(p->>'teamId'),0.9,now()) on conflict do nothing;
    end if;

    v_player := null; v_nat := null;
    select id into v_nat from countries where iso3=(p->>'nat') limit 1;
    v_foot := case p->>'foot' when 'Left' then 'LEFT' when 'Right' then 'RIGHT' when 'Both' then 'BOTH' else 'UNKNOWN' end;
    v_pos := case p->>'pos' when 'G' then 'Goalkeeper' when 'D' then 'Defender' when 'M' then 'Midfielder' when 'F' then 'Forward' else null end;
    select player_id into v_player from player_external_ids where provider_code='SOFASCORE' and external_id=(p->>'id');
    if v_player is null and nullif(p->>'dob','') is not null then
      select id into v_player from players where date_of_birth=(p->>'dob')::date and (normalized_name=gbm_normalize_name(p->>'name') or gbm_normalize_name(full_name)=gbm_normalize_name(p->>'name')) limit 1;
      if v_player is null then
        select id into v_player from players where date_of_birth=(p->>'dob')::date and current_club_id=v_club and split_part(gbm_normalize_name(full_name),' ',-1)=split_part(gbm_normalize_name(p->>'name'),' ',-1) limit 1;
      end if;
    end if;
    if v_player is null then
      insert into players(full_name, short_name, first_name, last_name, date_of_birth, nationality_country_id, height_cm, foot, primary_position, current_club_id, is_goalkeeper, gbm_status, data_confidence, last_enriched_at)
      values (p->>'name', p->>'name', split_part(p->>'name',' ',1), nullif(substring(p->>'name' from '\s(.+)$'),''), nullif(p->>'dob','')::date, v_nat,
        case when nullif(p->>'h','')::int between 120 and 230 then (p->>'h')::int end, v_foot, v_pos, v_club, (p->>'pos')='G', 'NONE', 0.7, now())
      returning id into v_player; v_created:=v_created+1;
    else
      v_matched:=v_matched+1;
      update players set
        date_of_birth=coalesce(date_of_birth, nullif(p->>'dob','')::date),
        nationality_country_id=coalesce(nationality_country_id, v_nat),
        height_cm=coalesce(height_cm, case when nullif(p->>'h','')::int between 120 and 230 then (p->>'h')::int end),
        foot=case when foot is null or foot='UNKNOWN' then v_foot else foot end,
        primary_position=coalesce(primary_position, v_pos),
        current_club_id=case when v_is_current then v_club else coalesce(current_club_id, v_club) end,
        is_goalkeeper=coalesce(is_goalkeeper,(p->>'pos')='G'),
        last_enriched_at=now(), updated_at=now()
      where id=v_player;
    end if;
    insert into player_external_ids(player_id,provider_code,namespace,external_id,url,confidence,match_method,verified_at)
      values (v_player,'SOFASCORE','player',p->>'id',v_url,0.95,'sofascore_ingest',now())
      on conflict (provider_code, namespace, external_id) do nothing;
    insert into player_links(player_id,kind,url,label) values (v_player,'OTHER',v_url,'SofaScore profile') on conflict do nothing;

    delete from player_season_stats where player_id=v_player and season_id=v_season and provider_code='SOFASCORE';
    insert into player_season_stats(player_id,season_id,competition_id,club_id,provider_code,matches_played,minutes_played,goals,assists,yellow_cards,red_cards,xg,xa,shots,shots_on_target,key_passes,passes,passes_accurate,dribbles,dribbles_successful,interceptions,tackles,clearances,saves,goals_conceded,clean_sheets,advanced,retrieved_at)
    values (v_player,v_season,v_comp,v_club,'SOFASCORE',nullif(p->>'apps','')::int,nullif(p->>'min','')::int,nullif(p->>'g','')::int,nullif(p->>'a','')::int,nullif(p->>'yc','')::int,nullif(p->>'rc','')::int,nullif(p->>'xg','')::numeric,nullif(p->>'xa','')::numeric,nullif(p->>'sh','')::int,nullif(p->>'sot','')::int,nullif(p->>'kp','')::int,
      case when nullif(p->>'passN','') is not null and nullif(p->>'pass','')::numeric>0 then round((p->>'passN')::numeric/((p->>'pass')::numeric/100)) end::int,
      nullif(p->>'passN','')::int,
      case when nullif(p->>'drb','') is not null and nullif(p->>'drbPct','')::numeric>0 then round((p->>'drb')::numeric/((p->>'drbPct')::numeric/100)) end::int,
      nullif(p->>'drb','')::int,nullif(p->>'int','')::int,nullif(p->>'tkl','')::int,nullif(p->>'clr','')::int,nullif(p->>'saves','')::int,nullif(p->>'gc','')::int,nullif(p->>'cs','')::int,
      jsonb_build_object('rating',nullif(p->>'rat','')::numeric,'pass_accuracy_pct',nullif(p->>'pass','')::numeric,'dribble_success_pct',nullif(p->>'drbPct','')::numeric,'duels_won_pct',nullif(p->>'duel','')::numeric,'aerial_won_pct',nullif(p->>'aer','')::numeric,'big_chances_created',nullif(p->>'bcc','')::int,'big_chances_missed',nullif(p->>'bcm','')::int,'long_ball_accuracy_pct',nullif(p->>'acc_long','')::numeric,'touches',nullif(p->>'touches','')::int,'possession_lost',nullif(p->>'poss_lost','')::int,'was_fouled',nullif(p->>'fouled','')::int,'dispossessed',nullif(p->>'dispossessed','')::int,'sofascore_team',p->>'team','batch',p_batch),
      now());
    v_stats:=v_stats+1;

    if nullif(p->>'cu','') is not null and not exists (select 1 from contracts where player_id=v_player and expires_on=(p->>'cu')::date) then
      insert into contracts(player_id,club_id,expires_on,status,provider_code,source_url,retrieved_at) values (v_player,v_club,(p->>'cu')::date,'ACTIVE','SOFASCORE',v_url,now());
    end if;
    if nullif(p->>'mv','') is not null then
      insert into market_values(player_id,value_amount,currency,valued_on,club_id,provider_code,source_url,retrieved_at) values (v_player,(p->>'mv')::numeric,'EUR',current_date,v_club,'SOFASCORE',v_url,now()) on conflict do nothing;
    end if;
    if not exists (select 1 from player_team_history where player_id=v_player and club_id=v_club and season_id=v_season) then
      insert into player_team_history(player_id,club_id,club_name_raw,season_id,competition_id,start_date,is_current,source_provider) values (v_player,v_club,p->>'team',v_season,v_comp,v_start,v_is_current,'SOFASCORE') on conflict do nothing;
    end if;
    insert into source_records(provider_code,resource_type,external_id,namespace,payload,payload_hash,schema_version,source_url,retrieved_at,player_id,club_id,collected_by)
      values ('SOFASCORE','player_season_snapshot',p->>'id',p_batch,p,md5(p::text),1,v_url,now(),v_player,v_club,'CLAUDE_COWORK') on conflict do nothing;

    update staging_ingest set processed_at=now() where id=r.id;
  end loop;
  return jsonb_build_object('batch',p_batch,'players_created',v_created,'players_matched',v_matched,'stats_rows',v_stats,'clubs_created',v_clubs,'season',v_season,'competition',v_comp);
end $function$;

create or replace function ingest_tm_agent_batch(p_batch text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare r record; p jsonb; v_pid uuid; v_url text; v_agent text; v_status representation_status; v_pos text; n_rep int:=0; n_ext int:=0; n_unmatched int:=0;
begin
  for r in select id, payload from staging_ingest where batch_code=p_batch and source='TRANSFERMARKT' and processed_at is null loop
    p := r.payload; v_pid := (p->>'player_id')::uuid;
    if not coalesce((p->>'matched')::boolean,false) or nullif(p->'tm'->>'id','') is null then
      n_unmatched:=n_unmatched+1;
      update representation_records set is_current=false where player_id=v_pid and is_current and provider_code='TRANSFERMARKT';
      insert into representation_records(player_id,agency_name,agent_name,status,provider_code,source_url,retrieved_at,is_current)
        values (v_pid,null,null,'UNKNOWN','TRANSFERMARKT','https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query='||(p->>'query'),now(),true);
      update staging_ingest set processed_at=now() where id=r.id; continue;
    end if;
    v_url := 'https://www.transfermarkt.com'||(p->'tm'->>'href');
    insert into player_external_ids(player_id,provider_code,namespace,external_id,url,confidence,match_method,verified_at)
      values (v_pid,'TRANSFERMARKT',null,p->'tm'->>'id',v_url,least(0.95,(p->>'conf')::numeric),'claude_tm_quicksearch',now())
      on conflict (provider_code, namespace, external_id) do nothing;
    n_ext:=n_ext+1;
    v_agent := nullif(trim(p->'tm'->>'agent'),'');
    v_status := case when v_agent is null then 'NO_AGENCY_LISTED' else 'KNOWN_AGENCY' end;
    update representation_records set is_current=false where player_id=v_pid and is_current;
    insert into representation_records(player_id,agency_name,agent_name,status,provider_code,source_url,retrieved_at,is_current)
      values (v_pid,v_agent,null,v_status,'TRANSFERMARKT',v_url,now(),true);
    n_rep:=n_rep+1;
    if gbm_parse_tm_value(p->'tm'->>'mv') is not null then
      insert into market_values(player_id,value_amount,currency,valued_on,club_id,provider_code,source_url,retrieved_at)
        values (v_pid,gbm_parse_tm_value(p->'tm'->>'mv'),'EUR',current_date,(select current_club_id from players where id=v_pid),'TRANSFERMARKT',v_url,now()) on conflict do nothing;
    end if;
    v_pos := case p->'tm'->>'pos' when 'GK' then 'Goalkeeper' when 'CB' then 'Centre-Back' when 'RB' then 'Right-Back' when 'LB' then 'Left-Back' when 'DM' then 'Defensive Midfield' when 'CM' then 'Central Midfield' when 'AM' then 'Attacking Midfield' when 'RM' then 'Right Midfield' when 'LM' then 'Left Midfield' when 'RW' then 'Right Winger' when 'LW' then 'Left Winger' when 'CF' then 'Centre-Forward' when 'SS' then 'Second Striker' else null end;
    if v_pos is not null then
      update players set primary_position=v_pos, updated_at=now() where id=v_pid and (primary_position is null or primary_position in ('Goalkeeper','Defender','Midfielder','Forward','Missing'));
    end if;
    if gbm_normalize_name(p->'tm'->>'name') <> (select normalized_name from players where id=v_pid) then
      insert into player_aliases(player_id,alias,alias_type,source_provider) select v_pid, p->'tm'->>'name','TRANSFERMARKT','TRANSFERMARKT'
        where not exists (select 1 from player_aliases a where a.player_id=v_pid and a.normalized_alias=gbm_normalize_name(p->'tm'->>'name'));
    end if;
    insert into player_links(player_id,kind,url,label) values (v_pid,'OTHER',v_url,'Transfermarkt profile') on conflict do nothing;
    insert into source_records(provider_code,resource_type,external_id,namespace,payload,payload_hash,schema_version,source_url,retrieved_at,player_id,collected_by)
      values ('TRANSFERMARKT','quicksearch_row',p->'tm'->>'id',p_batch,p,md5(p::text),1,v_url,now(),v_pid,'CLAUDE_COWORK') on conflict do nothing;
    update staging_ingest set processed_at=now() where id=r.id;
  end loop;
  return jsonb_build_object('batch',p_batch,'representation_rows',n_rep,'external_ids',n_ext,'unmatched',n_unmatched);
end $function$;

create or replace function ingest_tm_profile_batch(p_batch text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare r record; p jsonb; v_pid uuid; v_url text; v_agent text; v_status representation_status; v_pos text; v_contract date; v_h int; v_foot preferred_foot; v_dob date; n int:=0; n_agent int:=0; n_free int:=0;
begin
  for r in select id, payload from staging_ingest where batch_code=p_batch and source='TRANSFERMARKT' and processed_at is null loop
    p := r.payload; v_pid := (p->>'player_id')::uuid; v_url := 'https://www.transfermarkt.com'||(p->>'href');
    v_agent := nullif(trim(p->>'agent'),'');
    if v_agent is not null and v_agent ~* '^(no agent|without club|-)$' then v_agent := null; end if;
    v_status := case when v_agent is null then 'NO_AGENCY_LISTED' else 'KNOWN_AGENCY' end;
    update representation_records set is_current=false where player_id=v_pid and is_current;
    insert into representation_records(player_id,agency_name,agent_name,status,provider_code,source_url,retrieved_at,is_current)
      values (v_pid,v_agent,null,v_status,'TRANSFERMARKT',v_url,now(),true);
    if v_agent is null then n_free:=n_free+1; else n_agent:=n_agent+1; end if;
    begin v_contract := to_date(substring(p->>'contract' from '\d{2}/\d{2}/\d{4}'),'DD/MM/YYYY'); exception when others then v_contract := null; end;
    if v_contract is not null and not exists (select 1 from contracts where player_id=v_pid and expires_on=v_contract and provider_code='TRANSFERMARKT') then
      insert into contracts(player_id,club_id,expires_on,status,provider_code,source_url,retrieved_at) values (v_pid,(select current_club_id from players where id=v_pid),v_contract,'ACTIVE','TRANSFERMARKT',v_url,now());
    end if;
    if gbm_parse_tm_value(split_part(p->>'mv',' Last',1)) is not null then
      insert into market_values(player_id,value_amount,currency,valued_on,club_id,provider_code,source_url,retrieved_at)
        values (v_pid,gbm_parse_tm_value(split_part(p->>'mv',' Last',1)),'EUR',current_date,(select current_club_id from players where id=v_pid),'TRANSFERMARKT',v_url,now()) on conflict do nothing;
    end if;
    v_h := case when (p->>'height') ~ '\d' then round(replace(regexp_replace(p->>'height','[^0-9,\.]','','g'),',','.')::numeric*100) end;
    v_foot := case lower(p->>'foot') when 'left' then 'LEFT' when 'right' then 'RIGHT' when 'both' then 'BOTH' else null end;
    v_pos := nullif(trim(split_part(p->>'pos',' - ',2)),''); if v_pos is null then v_pos := nullif(trim(p->>'pos'),''); end if;
    begin v_dob := to_date(substring(p->>'dob' from '\d{2}/\d{2}/\d{4}'),'DD/MM/YYYY'); exception when others then v_dob := null; end;
    update players set
      height_cm = coalesce(height_cm, case when v_h between 120 and 230 then v_h end),
      foot = case when foot is null or foot='UNKNOWN' then coalesce(v_foot,'UNKNOWN') else foot end,
      primary_position = case when primary_position is null or primary_position in ('Goalkeeper','Defender','Midfielder','Forward','Missing') then coalesce(v_pos, primary_position) else primary_position end,
      date_of_birth = coalesce(date_of_birth, v_dob),
      data_confidence = greatest(coalesce(data_confidence,0), 0.85), last_enriched_at=now(), updated_at=now()
    where id=v_pid;
    insert into source_records(provider_code,resource_type,external_id,namespace,payload,payload_hash,schema_version,source_url,retrieved_at,player_id,collected_by)
      values ('TRANSFERMARKT','player_profile',p->>'tm_id',p_batch,p,md5(p::text),1,v_url,now(),v_pid,'CLAUDE_COWORK') on conflict do nothing;
    update staging_ingest set processed_at=now() where id=r.id; n:=n+1;
  end loop;
  return jsonb_build_object('batch',p_batch,'profiles',n,'with_agent',n_agent,'no_agent',n_free);
end $function$;

-- ----------------------------------------------------------------------------
-- Quality control over what the ingestion matched
-- ----------------------------------------------------------------------------

create or replace function claude_flag_tm_club_mismatch(p_batch text)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare r record; n int:=0; v_cur text; begin
  for r in select payload from staging_ingest where batch_code=p_batch and source='TRANSFERMARKT' loop
    select c.name into v_cur from players p left join clubs c on c.id=p.current_club_id where p.id=(r.payload->>'player_id')::uuid;
    if nullif(r.payload->>'club','') is not null and v_cur is not null and gbm_find_club(r.payload->>'club', null) is distinct from (select current_club_id from players where id=(r.payload->>'player_id')::uuid)
       and similarity(gbm_normalize_name(r.payload->>'club'), gbm_normalize_name(v_cur)) < 0.5 then
      insert into player_events(player_id,event_type,title,detail,previous_value,new_value,severity,provider_code,occurred_at,detected_at)
      values ((r.payload->>'player_id')::uuid,'CLUB_MISMATCH','Transfermarkt lists a different current club','Transfermarkt shows '||(r.payload->>'club')||' (joined '||coalesce(r.payload->>'joined','?')||'); platform has '||v_cur||'. Verify and update current club.',
        jsonb_build_object('club',v_cur), jsonb_build_object('club',r.payload->>'club','joined',r.payload->>'joined'), 2, 'TRANSFERMARKT', now(), now());
      n:=n+1;
    end if;
  end loop; return n; end $function$;

create or replace function claude_invalidate_bad_tm_matches(p_batch text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare r record; v_dob date; n int:=0; names text:=''; begin
  for r in select payload from staging_ingest where batch_code=p_batch and source='TRANSFERMARKT' loop
    begin v_dob := to_date(substring(r.payload->>'dob' from '\d{2}/\d{2}/\d{4}'),'DD/MM/YYYY'); exception when others then v_dob := null; end;
    if (r.payload->>'club') ilike 'retired%' or (v_dob is not null and (select date_of_birth from players where id=(r.payload->>'player_id')::uuid) is not null and abs((select date_of_birth from players where id=(r.payload->>'player_id')::uuid) - v_dob) > 400) then
      delete from player_external_ids where player_id=(r.payload->>'player_id')::uuid and provider_code='TRANSFERMARKT';
      delete from player_links where player_id=(r.payload->>'player_id')::uuid and url like '%transfermarkt%';
      delete from contracts where player_id=(r.payload->>'player_id')::uuid and provider_code='TRANSFERMARKT' and retrieved_at > now()-interval '3 hours';
      delete from market_values where player_id=(r.payload->>'player_id')::uuid and provider_code='TRANSFERMARKT' and retrieved_at > now()-interval '3 hours';
      delete from player_events where player_id=(r.payload->>'player_id')::uuid and event_type='CLUB_MISMATCH';
      update representation_records set is_current=false where player_id=(r.payload->>'player_id')::uuid and is_current;
      insert into representation_records(player_id,agency_name,status,provider_code,source_url,retrieved_at,is_current) values ((r.payload->>'player_id')::uuid,null,'UNKNOWN','TRANSFERMARKT','https://www.transfermarkt.com'||(r.payload->>'href')||' (rejected: wrong person)',now(),true);
      n:=n+1; names := names||(r.payload->>'name')||'; ';
    end if;
  end loop;
  return jsonb_build_object('invalidated',n,'names',names);
end $function$;

-- ----------------------------------------------------------------------------
-- League-relative percentiles, and the reports built on them
-- ----------------------------------------------------------------------------

create or replace function claude_compute_percentiles(p_min_minutes integer default 300)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare v_rows int; begin
  delete from player_percentiles where peer_group like 'CLAUDE:%';
  with base as (
    select ps.player_id, ps.season_id, ps.competition_id, ps.minutes_played m,
      'CLAUDE:'||c.name||' '||se.name||' / '||case when p.is_goalkeeper or p.primary_position ilike '%goalkeeper%' then 'GK' when p.primary_position ilike '%back%' or p.primary_position='Defender' then 'DEF' when p.primary_position ilike '%midfield%' or p.primary_position='Midfielder' then 'MID' else 'FWD' end as grp,
      (ps.advanced->>'rating')::numeric rating,
      ((coalesce(ps.goals,0)+coalesce(ps.assists,0))*90.0/ps.minutes_played)::numeric ga90,
      (coalesce(ps.goals,0)*90.0/ps.minutes_played)::numeric g90,
      (coalesce(ps.assists,0)*90.0/ps.minutes_played)::numeric a90,
      (coalesce(ps.key_passes,0)*90.0/ps.minutes_played)::numeric kp90,
      (coalesce(ps.dribbles_successful,0)*90.0/ps.minutes_played)::numeric drb90,
      (coalesce(ps.shots,0)*90.0/ps.minutes_played)::numeric sh90,
      ((coalesce(ps.interceptions,0)+coalesce(ps.tackles,0))*90.0/ps.minutes_played)::numeric def90,
      (coalesce((ps.advanced->>'big_chances_created')::numeric,0)*90.0/ps.minutes_played)::numeric bcc90,
      (ps.advanced->>'pass_accuracy_pct')::numeric pass_pct,
      (ps.advanced->>'duels_won_pct')::numeric duel_pct,
      (ps.advanced->>'aerial_won_pct')::numeric aerial_pct,
      (coalesce(ps.passes_accurate,0)*90.0/ps.minutes_played)::numeric acc_pass90
    from player_season_stats ps join players p on p.id=ps.player_id join competitions c on c.id=ps.competition_id join seasons se on se.id=ps.season_id
    where ps.provider_code='SOFASCORE' and ps.minutes_played>=p_min_minutes
  ), long as (
    select player_id, season_id, grp, m, k, v::numeric v from base,
      lateral (values ('rating',rating),('ga_per90',ga90),('goals_per90',g90),('assists_per90',a90),('key_passes_per90',kp90),('dribbles_per90',drb90),('shots_per90',sh90),('defensive_actions_per90',def90),('big_chances_created_per90',bcc90),('pass_accuracy_pct',pass_pct),('duels_won_pct',duel_pct),('aerial_won_pct',aerial_pct),('accurate_passes_per90',acc_pass90)) as t(k,v)
    where v is not null
  ), ranked as (
    select *, round((100.0*percent_rank() over (partition by grp, k order by v))::numeric,1) pct, count(*) over (partition by grp,k) grp_n from long
  )
  insert into player_percentiles(player_id,season_id,metric_key,raw_value,per90_value,percentile,peer_group,peer_group_size,computed_at)
  select player_id, season_id, k, round(v,3), case when k like '%per90' then round(v,3) end, pct, grp, grp_n, now() from ranked where grp_n>=8;
  get diagnostics v_rows = row_count; return v_rows;
end $function$;

create or replace function claude_write_reports(p_min_score numeric default 70, p_max integer default 300, p_watchlist_min numeric default 80)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare r record; v_sections jsonb; v_metrics jsonb; v_head text; v_summary text; v_verdict text; n_rep int:=0; n_sig int:=0; n_wl int:=0;
  v_wl uuid; v_ga text; v_pos_note text; v_profile_type text; v_ss_z text;
begin
  select id into v_wl from watchlists order by created_at limit 1;
  for r in
    with best as (
      select distinct on (player_id) * from v_claude_candidates
      where age<=23.99 and (minutes>=300 or (minutes is null and apps>=4)) and claude_score>=p_min_score
      order by player_id, season_current desc, claude_score desc
    ) select * from best order by claude_score desc limit p_max
  loop
    v_ga := case when r.minutes>0 then (r.goals||' G / '||r.assists||' A in '||r.minutes||' min ('||r.ga_per90||' G+A per 90)') else (coalesce(r.goals,0)||' G / '||coalesce(r.assists,0)||' A in '||coalesce(r.apps,0)||' apps') end;
    v_ss_z := case when r.rating_z is null then 'n/a' when r.rating_z>=2 then 'elite for this league/position (+'||r.rating_z||' SD)' when r.rating_z>=1 then 'clearly above peers (+'||r.rating_z||' SD)' when r.rating_z>=0.3 then 'above average (+'||r.rating_z||' SD)' when r.rating_z>=-0.3 then 'average' else 'below peers ('||r.rating_z||' SD)' end;
    v_profile_type := case
      when r.pos ilike '%goalkeeper%' then 'Goalkeeper'
      when r.pos ilike '%back%' or r.pos='Defender' then case when coalesce(r.key_passes,0)>=15 or coalesce(r.dribbles_successful,0)>=15 then 'Progressive / attacking defender' when coalesce(r.duel_pct,0)>=60 then 'Duel-dominant defender' else 'Defender' end
      when r.pos ilike '%midfield%' or r.pos='Midfielder' then case when coalesce(r.ga_per90,0)>=0.5 then 'Goal-contributing midfielder' when coalesce(r.key_passes,0)>=25 then 'Creative midfielder' when coalesce(r.pass_pct,0)>=85 then 'Ball-retaining midfielder' when coalesce(r.duel_pct,0)>=55 then 'Ball-winning midfielder' else 'Midfielder' end
      else case when coalesce(r.ga_per90,0)>=0.7 then 'High-output attacker' when coalesce(r.dribbles_successful,0)>=30 then 'Dribbling winger/forward' when coalesce(r.key_passes,0)>=20 then 'Creative forward' else 'Forward' end end;
    v_verdict := case
      when r.claude_score>=88 and coalesce(r.rep_status,'')<>'KNOWN_AGENCY' then 'PRIORITY: representation target. Data profile is strong for age and level and no agency is listed; verify with live/video scouting and contact the club.'
      when r.claude_score>=88 then 'STRONG: outstanding data profile for age and level; agency listed ('||coalesce(r.agency,'?')||') so approach as club-placement/partner opportunity.'
      when r.claude_score>=78 and coalesce(r.rep_status,'')<>'KNOWN_AGENCY' then 'WATCH: promising numbers and apparently agent-free; schedule video review of 2-3 full matches.'
      when r.claude_score>=78 then 'MONITOR: good numbers, represented. Track for contract expiry / value growth.'
      else 'TRACK: interesting but sample or output limited; re-evaluate after more minutes.' end;
    v_head := r.full_name||' ('||r.age||', '||coalesce(r.pos,'?')||', '||coalesce(r.nat_iso3,'?')||') - '||coalesce(r.club_name,'?')||' | '||r.comp_name||' '||r.season_name||' | Claude score '||r.claude_score;
    v_summary := v_profile_type||'. SofaScore rating '||coalesce(round(r.rating,2)::text,'n/a')||' = '||v_ss_z||'. '||v_ga||'. '
      ||case when r.pass_pct is not null then 'Pass accuracy '||r.pass_pct||'%, '||coalesce(r.key_passes,0)||' key passes, '||coalesce(r.dribbles_successful,0)||' successful dribbles, '||coalesce(r.duel_pct,0)||'% duels won. ' else 'Detailed event stats not covered for this league. ' end
      ||'Contract: '||coalesce(r.contract_expires::text,'unknown')||'. Market value: '||coalesce(r.market_value::text,'n/a')||' EUR. Representation: '||coalesce(r.rep_status,'not checked')||coalesce(' ('||r.agency||')','')||'. '||v_verdict;
    v_sections := jsonb_build_array(
      jsonb_build_object('heading','Profile','body', r.full_name||', born '||r.date_of_birth||' ('||r.age||'), '||coalesce(r.nationality,'?')||', '||coalesce(r.pos,'?')||', '||coalesce(r.foot::text,'?')||' foot, '||coalesce(r.height_cm::text,'?')||' cm. Club: '||coalesce(r.club_name,'?')||' ('||r.comp_name||', '||r.tier||', '||coalesce(r.comp_country,'')||').'),
      jsonb_build_object('heading','Season output','body', r.season_name||': '||coalesce(r.apps,0)||' apps, '||v_ga||'. Rating '||coalesce(round(r.rating,2)::text,'n/a')||' ('||v_ss_z||').'),
      jsonb_build_object('heading','Passing and creativity','body', case when r.pass_pct is null then 'Not covered.' else 'Pass accuracy '||r.pass_pct||'%; key passes '||coalesce(r.key_passes,0)||'; big chances created '||coalesce(r.big_chances_created,0)||'; successful dribbles '||coalesce(r.dribbles_successful,0)||'.' end),
      jsonb_build_object('heading','Duels and defending','body', case when r.duel_pct is null then 'Not covered.' else 'Duels won '||r.duel_pct||'%; aerials won '||coalesce(r.aerial_pct,0)||'%; interceptions '||coalesce(r.interceptions,0)||'; tackles '||coalesce(r.tackles,0)||'; clearances '||coalesce(r.clearances,0)||'.' end),
      jsonb_build_object('heading','Shooting','body', case when r.shots is null then 'Not covered.' else 'Shots '||r.shots||' (on target '||coalesce(r.shots_on_target,0)||'); goals '||coalesce(r.goals,0)||case when r.xg is not null then '; xG '||r.xg else '' end||'. Conversion '||case when coalesce(r.shots,0)>0 then round(100.0*coalesce(r.goals,0)/r.shots,1)||'%' else 'n/a' end||'.' end),
      jsonb_build_object('heading','Contract and representation','body', 'Contract expires '||coalesce(r.contract_expires::text,'unknown')||'. Market value '||coalesce(r.market_value::text,'n/a')||' EUR. Representation status '||coalesce(r.rep_status,'not checked')||coalesce(' - '||r.agency,'')||'.'),
      jsonb_build_object('heading','Verdict','body', v_verdict)
    );
    v_metrics := jsonb_build_object('claude_score',r.claude_score,'rating',r.rating,'rating_z',r.rating_z,'apps',r.apps,'minutes',r.minutes,'goals',r.goals,'assists',r.assists,'ga_per90',r.ga_per90,'pass_pct',r.pass_pct,'key_passes',r.key_passes,'dribbles_successful',r.dribbles_successful,'duel_pct',r.duel_pct,'aerial_pct',r.aerial_pct,'shots',r.shots,'shots_on_target',r.shots_on_target,'big_chances_created',r.big_chances_created,'interceptions',r.interceptions,'tackles',r.tackles,'clearances',r.clearances,'xg',r.xg,'xa',r.xa,'profile_type',v_profile_type,'batch',r.batch);
    update intel_reports set is_current=false where player_id=r.player_id and report_type='PERFORMANCE' and author_code='CLAUDE_COWORK' and is_current;
    insert into intel_reports(player_id,agent_id,report_type,version,is_current,headline,summary,sections,metrics,sources,model_name,confidence,period_start,period_end,author_code)
      values (r.player_id,null,'PERFORMANCE',(select coalesce(max(version),0)+1 from intel_reports where player_id=r.player_id and report_type='PERFORMANCE'),true,v_head,v_summary,v_sections,v_metrics,
        jsonb_build_array(jsonb_build_object('provider','SOFASCORE','url',r.sofascore_url), jsonb_build_object('provider','TRANSFERMARKT','url',r.transfermarkt_url)),
        'claude-fable-5 (CLAUDE_COWORK, rule-assisted)', case when r.minutes>=1000 then 0.75 when r.minutes>=500 then 0.6 else 0.45 end, null, null, 'CLAUDE_COWORK');
    n_rep:=n_rep+1;
    update discovery_signals set is_current=false where player_id=r.player_id and signal_type='CLAUDE_SCOUT_SCORE' and is_current;
    insert into discovery_signals(player_id,signal_type,score,rationale,evidence,season_id,model_version,computed_at,is_current)
      values (r.player_id,'CLAUDE_SCOUT_SCORE',r.claude_score,v_profile_type||' · '||v_ss_z||' · '||v_ga||' · rep '||coalesce(r.rep_status,'?'),v_metrics,null,'claude_v1',now(),true)
      on conflict (player_id,signal_type,model_version,season_id) do update set score=excluded.score, rationale=excluded.rationale, evidence=excluded.evidence, computed_at=now(), is_current=true;
    n_sig:=n_sig+1;
    if v_wl is not null and r.claude_score>=p_watchlist_min and r.gbm_status='NONE' then
      insert into watchlist_players(watchlist_id,player_id,status,priority,reason)
        values (v_wl,r.player_id,'DISCOVERED', case when r.claude_score>=90 and coalesce(r.rep_status,'')<>'KNOWN_AGENCY' then 1 when r.claude_score>=85 then 2 else 3 end, 'Claude scouting '||current_date||': '||v_profile_type||', score '||r.claude_score||', '||v_ss_z||', rep '||coalesce(r.rep_status,'?'))
        on conflict (watchlist_id,player_id) do nothing;
      n_wl:=n_wl+1;
    end if;
  end loop;
  return jsonb_build_object('reports',n_rep,'signals',n_sig,'watchlist_added',n_wl);
end $function$;

-- ----------------------------------------------------------------------------
-- The token-guarded queue (see 0044 for why the secret is a digest)
-- ----------------------------------------------------------------------------
create or replace function claude_tm_queue(p_token text, p_limit integer default 400)
returns table(player_id uuid, full_name text, dob date, club text, nat text, has_tm boolean)
language plpgsql security definer set search_path to 'public' as $function$
begin
  if not exists (
    select 1 from claude_agent_secrets
     where name = 'tm_queue'
       and secret = encode(extensions.digest(p_token, 'sha256'), 'hex')
  ) then
    raise exception 'bad token' using errcode = '28000';
  end if;

  return query
  with c as (
    select v.player_id, max(v.claude_score) sc from v_claude_candidates v
    where v.age<=23.99 and (v.minutes>=300 or (v.minutes is null and v.apps>=4))
    group by v.player_id
  )
  select p.id, p.full_name, p.date_of_birth, cl.name, co.iso3,
         exists(select 1 from player_external_ids e where e.player_id=p.id and e.provider_code='TRANSFERMARKT')
  from c join players p on p.id=c.player_id
  left join clubs cl on cl.id=p.current_club_id
  left join countries co on co.id=p.nationality_country_id
  where not exists (select 1 from representation_records rr
                     where rr.player_id=p.id and rr.is_current
                       and rr.retrieved_at > now()-interval '30 days')
  order by c.sc desc limit p_limit;
end $function$;

-- ----------------------------------------------------------------------------
-- Function-level grants
-- ----------------------------------------------------------------------------
-- The nine unguarded writers stay off the API entirely; see 0044. Only the
-- token-guarded queue is reachable, and only because the token is its
-- authentication.
revoke execute on function claude_write_reports(numeric, integer, numeric) from public, anon, authenticated;
revoke execute on function claude_compute_percentiles(integer) from public, anon, authenticated;
revoke execute on function claude_flag_tm_club_mismatch(text) from public, anon, authenticated;
revoke execute on function claude_invalidate_bad_tm_matches(text) from public, anon, authenticated;
revoke execute on function ingest_sofascore_batch(text) from public, anon, authenticated;
revoke execute on function ingest_tm_agent_batch(text) from public, anon, authenticated;
revoke execute on function ingest_tm_profile_batch(text) from public, anon, authenticated;
revoke execute on function gbm_merge_player(uuid, uuid) from public, anon, authenticated;
revoke execute on function gbm_merge_club(uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
do $$
declare v_missing text;
begin
  select string_agg(name, ', ') into v_missing from (
    select o.name from (values
      ('claude_agent_secrets'),('club_recruitment_profiles'),('intel_ops_board'),
      ('recruitment_matches'),('sofascore_tournaments'),('staging_ingest'),
      ('v_claude_candidates'),('claude_compute_percentiles'),
      ('claude_flag_tm_club_mismatch'),('claude_invalidate_bad_tm_matches'),
      ('claude_tm_queue'),('claude_write_reports'),('gbm_find_club'),
      ('gbm_match_profile'),('gbm_merge_club'),('gbm_merge_player'),('gbm_norm'),
      ('gbm_parse_tm_value'),('ingest_sofascore_batch'),('ingest_tm_agent_batch'),
      ('ingest_tm_profile_batch')
    ) as o(name)
    where not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname=o.name and c.relkind in ('r','v'))
      and not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname=o.name)
  ) d;
  if v_missing is not null then
    raise exception 'the capture did not create: %', v_missing;
  end if;

  -- Scoped to the six tables this file writes grants for. The rest of the
  -- schema still carries Supabase's default TRUNCATE grant and changing that
  -- is a separate, deliberate decision — see the header.
  select string_agg(table_name || '/' || grantee || '/' || privilege_type, ', ') into v_missing
    from information_schema.role_table_grants
   where table_schema='public'
     and grantee in ('anon','authenticated','PUBLIC')
     and table_name in ('claude_agent_secrets','club_recruitment_profiles','intel_ops_board',
                        'recruitment_matches','sofascore_tournaments','staging_ingest',
                        'v_claude_candidates')
     and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');
  if v_missing is not null then
    raise exception 'a captured table still carries a grant beyond what it needs: %', v_missing;
  end if;

  -- The secrets table takes no grant at all: it is reached only from inside a
  -- SECURITY DEFINER function.
  if exists (select 1 from information_schema.role_table_grants
              where table_name='claude_agent_secrets'
                and grantee in ('anon','authenticated','PUBLIC')) then
    raise exception 'claude_agent_secrets is granted to a client role';
  end if;
end $$;
