-- ============================================================================
-- GBM INTELLIGENCE — 0051 PERCENTILES EARN THEIR COHORTS
-- ----------------------------------------------------------------------------
-- Phase B2: position intelligence. This replaces the methodology of
-- `claude_compute_percentiles` (captured verbatim in 0043) without deleting a
-- single row it wrote — the old results stay until the new ones are proven,
-- and they live under different peer groups ('CLAUDE:%' vs 'GBM:%').
--
-- WHAT WAS WRONG WITH THE OLD METHODOLOGY, precisely:
--
--   · peer groups of GK|DEF|MID|FWD — a wing-back ranked against a centre
--     back, an attacking midfielder against a holding one;
--   · cohorts accepted at eight players — percent_rank over eight is a
--     coin toss wearing a number;
--   · a 300-minute floor — three substitute appearances qualified a player
--     for per-90 ranking;
--   · single-source (SOFASCORE only), unversioned, and every run deleted
--     its predecessor.
--
-- THE NEW RULES (model POSITION_PERCENTILE_V1):
--
--   · families: GK, CB, FB_WB, DM, CM, AM, WINGER, STRIKER. Only specific
--     positions map; coarse labels ("Defender", "Midfielder", "Forward")
--     map to NULL and are excluded — guessing a family would fabricate the
--     cohort. 8,443 of 13,296 players map today.
--   · cohort = family × season name × competition-strength band (TOP ≥55,
--     MID 35–55, LOW <35, UNRATED), pooled across competitions. Fallback:
--     drop the band (cohort 'ALL'). No cross-season pooling — different
--     seasons are not peers. Minimum cohort 30, or nothing is written.
--   · minimum individual minutes 450; 900+ marks the row HIGH-confidence
--     (with cohort ≥60). The cohort actually used is recorded on every row.
--   · metrics come from the metric_catalog table and only from columns the
--     sources genuinely fill: counting metrics from the Transfermarkt
--     dataset (SOFASCORE as fallback), extended metrics from SOFASCORE
--     alone. Nothing is derived from data the platform does not hold.
--   · versioned: model_version on every row; a formula change is a new
--     version, never a silent overwrite.
--
-- Named gbm_cohort_family, not gbm_position_family: production already holds
-- gbm_position_family(text) returns text[] — the recruitment engine's map
-- from a requested position code to the stored position strings. Different
-- job, and it stays exactly as it is.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- player_percentiles learns to explain itself (additive; CLAUDE rows keep
-- NULLs here and are otherwise untouched).
-- ----------------------------------------------------------------------------
alter table player_percentiles
  add column if not exists model_version text,
  add column if not exists confidence text
    check (confidence in ('HIGH', 'MEDIUM', 'LOW') or confidence is null),
  add column if not exists cohort jsonb;

comment on column player_percentiles.cohort is
  'The cohort this percentile was computed in: {family, season, band, size, min_minutes} — plus {components} on PERFORMANCE_SCORE rows. Recorded so a number can always say who it compared against.';

-- ----------------------------------------------------------------------------
-- Position families. IMMUTABLE so it can sit in indexes and group-bys.
-- ----------------------------------------------------------------------------
create or replace function gbm_cohort_family(p_position text)
returns text
language sql
immutable
as $fn$
  select case
    when p_position = 'Goalkeeper' then 'GK'
    when p_position = 'Centre-Back' then 'CB'
    when p_position in ('Left-Back', 'Right-Back', 'Left fullback') then 'FB_WB'
    when p_position = 'Defensive Midfield' then 'DM'
    when p_position = 'Central Midfield' then 'CM'
    when p_position = 'Attacking Midfield' then 'AM'
    when p_position in ('Left Winger', 'Right Winger', 'Left Midfield', 'Right Midfield') then 'WINGER'
    when p_position in ('Centre-Forward', 'Second Striker') then 'STRIKER'
    -- "Defender", "Midfielder", "Forward", "Missing", NULL: assigning a
    -- family would be a guess, and a guessed cohort poisons every rank in it.
    else null
  end;
$fn$;

comment on function gbm_cohort_family is
  'Maps a recorded position to one of eight cohort families, or NULL when the position is too coarse to place honestly (Defender, Midfielder, Forward, Missing).';

-- ----------------------------------------------------------------------------
-- The metric catalog: what can honestly be ranked, from which columns, for
-- which families. A metric absent from this table does not exist to the
-- engine — adding one is a reviewed insert, not a code edit.
-- ----------------------------------------------------------------------------
create table if not exists metric_catalog (
  metric_key    text primary key,
  label         text not null,
  direction     text not null check (direction in ('HIGH', 'LOW')),
  kind          text not null check (kind in ('COUNTING', 'EXTENDED', 'RATIO')),
  families      text[] not null,
  description   text not null,
  display_order int not null default 100
);

comment on table metric_catalog is
  'The metrics the percentile engine may rank. COUNTING comes from the Transfermarkt dataset (SOFASCORE fallback); EXTENDED and RATIO exist only where SOFASCORE supplied the inputs. Nothing here is derived or imputed — a metric the sources do not carry is not in this table.';

insert into metric_catalog (metric_key, label, direction, kind, families, description, display_order) values
  ('goals_per90', 'Goals /90', 'HIGH', 'COUNTING',
   array['CB','FB_WB','DM','CM','AM','WINGER','STRIKER'],
   'Goals per 90 minutes. Counting fact from the dataset; no expected-goals adjustment.', 10),
  ('assists_per90', 'Assists /90', 'HIGH', 'COUNTING',
   array['CB','FB_WB','DM','CM','AM','WINGER','STRIKER'],
   'Assists per 90 minutes as the provider credits them.', 20),
  ('goal_contributions_per90', 'Goal contributions /90', 'HIGH', 'COUNTING',
   array['CB','FB_WB','DM','CM','AM','WINGER','STRIKER'],
   'Goals plus assists per 90 — the bluntest and most robust output measure.', 30),
  ('discipline_per90', 'Cards /90', 'LOW', 'COUNTING',
   array['GK','CB','FB_WB','DM','CM','AM','WINGER','STRIKER'],
   'Yellows plus twice reds per 90. Lower is better; a red costs a match.', 80),
  ('shots_per90', 'Shots /90', 'HIGH', 'EXTENDED',
   array['AM','WINGER','STRIKER'],
   'Shot volume per 90, where SOFASCORE recorded shots.', 40),
  ('key_passes_per90', 'Key passes /90', 'HIGH', 'EXTENDED',
   array['FB_WB','DM','CM','AM','WINGER','STRIKER'],
   'Passes leading directly to a shot, per 90, where recorded.', 50),
  ('xg_per90', 'xG /90', 'HIGH', 'EXTENDED',
   array['AM','WINGER','STRIKER'],
   'Expected goals per 90 where SOFASCORE supplies xG. Sparse today — cohorts often fail the floor, and that is the correct outcome.', 60),
  ('pass_accuracy_pct', 'Pass accuracy', 'HIGH', 'RATIO',
   array['GK','CB','FB_WB','DM','CM','AM','WINGER','STRIKER'],
   'Accurate passes over attempted, requiring at least 200 attempts — a ratio over a handful of passes is noise.', 70),
  ('saves_per90', 'Saves /90', 'HIGH', 'EXTENDED',
   array['GK'],
   'Saves per 90 for goalkeepers, where recorded. Volume reflects the team faced as much as the keeper — read with the cohort, not alone.', 15)
on conflict (metric_key) do nothing;

alter table metric_catalog enable row level security;
drop policy if exists "members can read" on metric_catalog;
create policy "members can read" on metric_catalog
  for select to authenticated using ((select gbm_is_member()));
revoke all on table metric_catalog from public, anon, authenticated;
grant select on table metric_catalog to authenticated;

-- ----------------------------------------------------------------------------
-- The qualifying set: one row per (player, season name) with family, chosen
-- sources, aggregated inputs, and the strength band of the competition the
-- player actually played most in. Shared by every engine below.
-- ----------------------------------------------------------------------------
create or replace function gbm_percentile_base()
returns table (
  player_id uuid,
  season_id uuid,
  season_name text,
  family text,
  band text,
  minutes int,
  matches int,
  goals int,
  assists int,
  yellows int,
  reds int,
  sofa_minutes int,
  shots int,
  key_passes int,
  passes int,
  passes_accurate int,
  saves int,
  xg numeric
)
language sql
stable
set search_path to 'public'
as $fn$
  with rows_named as (
    select pss.*, se.name as season_name,
           gbm_cohort_family(p.primary_position) as family
    from player_season_stats pss
    join seasons se on se.id = pss.season_id
    join players p on p.id = pss.player_id
    where gbm_cohort_family(p.primary_position) is not null
  ),
  -- Counting facts: the Transfermarkt dataset where it covers the player's
  -- season, SOFASCORE otherwise. Never summed across providers — that would
  -- double-count the same football.
  tm as (
    select player_id, season_name,
           sum(minutes_played) minutes, sum(matches_played) matches,
           sum(goals) goals, sum(assists) assists,
           sum(yellow_cards) yellows, sum(red_cards) reds,
           max(season_id::text)::uuid season_id
    from rows_named where provider_code = 'TRANSFERMARKT_DATASET'
    group by 1, 2
    having sum(minutes_played) is not null
  ),
  sofa as (
    select player_id, season_name,
           sum(minutes_played) minutes, sum(matches_played) matches,
           sum(goals) goals, sum(assists) assists,
           sum(yellow_cards) yellows, sum(red_cards) reds,
           sum(shots) shots, sum(key_passes) key_passes,
           sum(passes) passes, sum(passes_accurate) passes_accurate,
           sum(saves) saves, sum(xg) xg,
           max(season_id::text)::uuid season_id
    from rows_named where provider_code = 'SOFASCORE'
    group by 1, 2
  ),
  merged as (
    select
      coalesce(t.player_id, s.player_id) as player_id,
      coalesce(t.season_id, s.season_id) as season_id,
      coalesce(t.season_name, s.season_name) as season_name,
      coalesce(t.minutes, s.minutes)::int as minutes,
      coalesce(t.matches, s.matches)::int as matches,
      coalesce(t.goals, s.goals)::int as goals,
      coalesce(t.assists, s.assists)::int as assists,
      coalesce(t.yellows, s.yellows)::int as yellows,
      coalesce(t.reds, s.reds)::int as reds,
      s.minutes::int as sofa_minutes,
      s.shots::int, s.key_passes::int, s.passes::int,
      s.passes_accurate::int, s.saves::int, s.xg
    from tm t full outer join sofa s using (player_id, season_name)
  ),
  -- The competition the player spent most minutes in that season names the
  -- strength band. Band, not multiplier: context is recorded next to the
  -- rank, never multiplied into it.
  dominant as (
    select distinct on (r.player_id, r.season_name)
           r.player_id, r.season_name,
           case when c.strength_rating >= 55 then 'TOP'
                when c.strength_rating >= 35 then 'MID'
                when c.strength_rating is not null then 'LOW'
                else 'UNRATED' end as band
    from rows_named r
    left join competitions c on c.id = r.competition_id
    order by r.player_id, r.season_name, r.minutes_played desc nulls last
  )
  select m.player_id, m.season_id, m.season_name,
         gbm_cohort_family(p.primary_position) as family,
         d.band,
         m.minutes, m.matches, m.goals, m.assists, m.yellows, m.reds,
         m.sofa_minutes, m.shots, m.key_passes, m.passes, m.passes_accurate,
         m.saves, m.xg
  from merged m
  join players p on p.id = m.player_id
  left join dominant d on d.player_id = m.player_id and d.season_name = m.season_name
  where m.minutes is not null and m.minutes >= 450;
$fn$;

comment on function gbm_percentile_base is
  'One row per qualifying (player, season): family, 450+ minutes, counting facts (Transfermarkt dataset first, SOFASCORE fallback, never summed across providers), SOFASCORE extended inputs, and the strength band of the competition most played in.';

-- ----------------------------------------------------------------------------
-- THE PERCENTILE ENGINE — POSITION_PERCENTILE_V1
-- ----------------------------------------------------------------------------
create or replace function gbm_compute_percentiles()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '300s'
as $fn$
declare
  v_started timestamptz := clock_timestamp();
  v_model constant text := 'POSITION_PERCENTILE_V1';
  v_written int;
  v_deleted int;
  v_skipped_small int;
begin
  -- Every candidate (player, season, metric) value, with its banded cohort.
  create temp table t_vals on commit drop as
  with base as (select * from gbm_percentile_base()),
  vals as (
    select b.player_id, b.season_id, b.season_name, b.family, coalesce(b.band, 'UNRATED') as band,
           b.minutes, c.metric_key, c.direction,
           case c.metric_key
             when 'goals_per90' then round(b.goals * 90.0 / b.minutes, 3)
             when 'assists_per90' then round(b.assists * 90.0 / b.minutes, 3)
             when 'goal_contributions_per90' then round((b.goals + b.assists) * 90.0 / b.minutes, 3)
             when 'discipline_per90' then round((coalesce(b.yellows, 0) + 2 * coalesce(b.reds, 0)) * 90.0 / b.minutes, 3)
             when 'shots_per90' then case when b.sofa_minutes >= 450 and b.shots is not null
                  then round(b.shots * 90.0 / b.sofa_minutes, 3) end
             when 'key_passes_per90' then case when b.sofa_minutes >= 450 and b.key_passes is not null
                  then round(b.key_passes * 90.0 / b.sofa_minutes, 3) end
             when 'xg_per90' then case when b.sofa_minutes >= 450 and b.xg is not null
                  then round(b.xg * 90.0 / b.sofa_minutes, 3) end
             when 'saves_per90' then case when b.sofa_minutes >= 450 and b.saves is not null
                  then round(b.saves * 90.0 / b.sofa_minutes, 3) end
             when 'pass_accuracy_pct' then case when b.passes >= 200 and b.passes_accurate is not null
                  then round(b.passes_accurate * 100.0 / b.passes, 1) end
           end as value,
           case c.metric_key
             when 'goals_per90' then b.goals
             when 'assists_per90' then b.assists
             when 'goal_contributions_per90' then b.goals + b.assists
             when 'discipline_per90' then coalesce(b.yellows, 0) + 2 * coalesce(b.reds, 0)
             when 'shots_per90' then b.shots
             when 'key_passes_per90' then b.key_passes
             when 'xg_per90' then round(b.xg, 2)
             when 'saves_per90' then b.saves
             when 'pass_accuracy_pct' then b.passes_accurate
           end as raw_value
    from base b
    join metric_catalog c on b.family = any (c.families)
    -- Goals per 90 for a goalkeeper would technically compute; the catalog's
    -- families array is what keeps every metric where it means something.
  )
  select * from vals where value is not null;

  -- Banded cohorts first; where a band cannot seat 30, fall back to the
  -- whole family-season ('ALL'). A value whose fallback cohort is still
  -- under 30 is not written at all.
  create temp table t_ranked on commit drop as
  with banded as (
    select v.*, count(*) over (partition by metric_key, family, season_name, band) as cohort_n
    from t_vals v
  ),
  keep_banded as (
    select *, band as cohort_band from banded where cohort_n >= 30
  ),
  fallback as (
    select b.*, count(*) over (partition by metric_key, family, season_name) as all_n
    from banded b where b.cohort_n < 30
  ),
  keep_all as (
    select player_id, season_id, season_name, family, band, minutes, metric_key,
           direction, value, raw_value, all_n as cohort_n, 'ALL' as cohort_band
    from fallback where all_n >= 30
  ),
  unioned as (
    select player_id, season_id, season_name, family, minutes, metric_key,
           direction, value, raw_value, cohort_n, cohort_band
    from keep_banded
    union all
    select player_id, season_id, season_name, family, minutes, metric_key,
           direction, value, raw_value, cohort_n, cohort_band
    from keep_all
  )
  select u.*,
    round((percent_rank() over (
      partition by metric_key, family, season_name, cohort_band
      order by case when direction = 'HIGH' then value else -value end
    ))::numeric * 100, 1) as pct
  from unioned u;

  select count(*) into v_skipped_small from t_vals v
   where not exists (select 1 from t_ranked r
     where r.player_id = v.player_id and r.season_name = v.season_name
       and r.metric_key = v.metric_key);

  insert into player_percentiles
    (player_id, season_id, metric_key, raw_value, per90_value, percentile,
     peer_group, peer_group_size, model_version, confidence, cohort, computed_at)
  select player_id, season_id, metric_key, raw_value, value, pct,
         'GBM:' || family || ':' || season_name || ':' || cohort_band,
         cohort_n, v_model,
         case when minutes >= 900 and cohort_n >= 60 then 'HIGH' else 'MEDIUM' end,
         jsonb_build_object('family', family, 'season', season_name,
                            'band', cohort_band, 'size', cohort_n,
                            'min_minutes', 450, 'player_minutes', minutes),
         now()
  from t_ranked
  on conflict (player_id, season_id, metric_key, peer_group) do update
    set raw_value = excluded.raw_value,
        per90_value = excluded.per90_value,
        percentile = excluded.percentile,
        peer_group_size = excluded.peer_group_size,
        model_version = excluded.model_version,
        confidence = excluded.confidence,
        cohort = excluded.cohort,
        computed_at = excluded.computed_at;
  get diagnostics v_written = row_count;

  -- Replacement is proven the moment the new rows land, so rows of THIS
  -- model version the run did not refresh (a player who fell below the
  -- floor, a cohort that changed band) are stale and go. CLAUDE:% rows are
  -- a different model and are never touched here.
  delete from player_percentiles
   where model_version = v_model and computed_at < v_started;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'model', v_model, 'written', v_written, 'stale_removed', v_deleted,
    'skipped_below_cohort_floor', v_skipped_small);
end;
$fn$;

comment on function gbm_compute_percentiles is
  'POSITION_PERCENTILE_V1: family × season × strength-band cohorts (fallback: whole family-season), 450-minute floor, 30-player cohort floor, catalog-driven metrics, every row versioned and carrying its cohort. Never touches CLAUDE:% rows.';

revoke all on function gbm_compute_percentiles() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- THE PERFORMANCE SCORE — GBM_PERFORMANCE_V1
--
-- One 0–100 number per (player, season), and only one job: summarise the
-- player's percentile set within his family. It is NOT role fit, NOT the
-- opportunity score, NOT a transition judgement — those stay separate
-- numbers with separate names. Weights are per family, renormalised over
-- the metrics the player actually has; fewer than three metrics means no
-- score, because a summary of two numbers is just the louder of the two.
-- ----------------------------------------------------------------------------
create or replace function gbm_compute_performance_score()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $fn$
declare
  v_started timestamptz := clock_timestamp();
  v_model constant text := 'GBM_PERFORMANCE_V1';
  v_weights constant jsonb := '{
    "GK":      {"saves_per90": 0.5, "pass_accuracy_pct": 0.3, "discipline_per90": 0.2},
    "CB":      {"pass_accuracy_pct": 0.35, "discipline_per90": 0.35, "goal_contributions_per90": 0.2, "assists_per90": 0.1},
    "FB_WB":   {"key_passes_per90": 0.3, "assists_per90": 0.25, "pass_accuracy_pct": 0.2, "discipline_per90": 0.15, "goal_contributions_per90": 0.1},
    "DM":      {"pass_accuracy_pct": 0.35, "discipline_per90": 0.25, "key_passes_per90": 0.2, "goal_contributions_per90": 0.2},
    "CM":      {"assists_per90": 0.25, "key_passes_per90": 0.25, "goal_contributions_per90": 0.2, "pass_accuracy_pct": 0.2, "discipline_per90": 0.1},
    "AM":      {"goal_contributions_per90": 0.25, "assists_per90": 0.2, "key_passes_per90": 0.2, "goals_per90": 0.15, "shots_per90": 0.1, "discipline_per90": 0.1},
    "WINGER":  {"goal_contributions_per90": 0.25, "goals_per90": 0.2, "assists_per90": 0.2, "key_passes_per90": 0.15, "shots_per90": 0.1, "discipline_per90": 0.1},
    "STRIKER": {"goals_per90": 0.4, "goal_contributions_per90": 0.2, "shots_per90": 0.15, "assists_per90": 0.1, "xg_per90": 0.1, "discipline_per90": 0.05}
  }'::jsonb;
  v_written int;
  v_deleted int;
begin
  create temp table t_scores on commit drop as
  with metric_rows as (
    select pp.player_id, pp.season_id,
           pp.cohort ->> 'family' as family,
           pp.cohort ->> 'season' as season_name,
           (pp.cohort ->> 'player_minutes')::int as minutes,
           pp.metric_key,
           -- LOW-good metrics invert so every component reads "higher = better".
           case when mc.direction = 'LOW' then 100 - pp.percentile else pp.percentile end as good_pct,
           pp.confidence
    from player_percentiles pp
    join metric_catalog mc on mc.metric_key = pp.metric_key
    where pp.model_version = 'POSITION_PERCENTILE_V1'
  ),
  weighted as (
    select m.*, (v_weights -> m.family ->> m.metric_key)::numeric as w
    from metric_rows m
    where v_weights -> m.family ? m.metric_key
  ),
  scored as (
    select player_id, season_id, family, season_name,
           min(minutes) as minutes,
           count(*) as metrics_used,
           round(sum(good_pct * w) / nullif(sum(w), 0), 1) as score,
           bool_and(confidence = 'HIGH') as all_high,
           jsonb_object_agg(metric_key,
             jsonb_build_object('percentile', round(good_pct, 1), 'weight', w)) as components
    from weighted
    group by player_id, season_id, family, season_name
    having count(*) >= 3
  )
  select * from scored;

  insert into player_percentiles
    (player_id, season_id, metric_key, raw_value, per90_value, percentile,
     peer_group, peer_group_size, model_version, confidence, cohort, computed_at)
  select player_id, season_id, 'PERFORMANCE_SCORE', metrics_used, null, score,
         'GBM:PERF:' || family || ':' || season_name,
         metrics_used, v_model,
         case when all_high then 'HIGH' when metrics_used >= 4 then 'MEDIUM' else 'LOW' end,
         jsonb_build_object('family', family, 'season', season_name,
                            'components', components, 'metrics_used', metrics_used,
                            'player_minutes', minutes),
         now()
  from t_scores
  on conflict (player_id, season_id, metric_key, peer_group) do update
    set raw_value = excluded.raw_value,
        percentile = excluded.percentile,
        peer_group_size = excluded.peer_group_size,
        model_version = excluded.model_version,
        confidence = excluded.confidence,
        cohort = excluded.cohort,
        computed_at = excluded.computed_at;
  get diagnostics v_written = row_count;

  delete from player_percentiles
   where model_version = v_model and computed_at < v_started;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('model', v_model, 'written', v_written, 'stale_removed', v_deleted);
end;
$fn$;

comment on function gbm_compute_performance_score is
  'GBM_PERFORMANCE_V1: one 0–100 summary of a player''s POSITION_PERCENTILE_V1 set, weighted per family and renormalised over the metrics he actually has (minimum three). Components recorded on the row — the number can always show its working. Separate from role fit, opportunity and transition by design.';

revoke all on function gbm_compute_performance_score() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- DEVELOPMENT TRENDS — GBM_DEVELOPMENT_V1
--
-- Season-over-season movement in output and minutes, classified with reason
-- codes. Age is context for BREAKTHROUGH, never a metric on its own.
-- ----------------------------------------------------------------------------
create or replace function gbm_compute_development()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $fn$
declare
  v_model constant text := 'GBM_DEVELOPMENT_V1';
  v_written int;
begin
  create temp table t_dev on commit drop as
  with base as (
    select b.*, (b.goals + b.assists) * 90.0 / b.minutes as contrib90,
           row_number() over (partition by b.player_id order by b.season_name desc) as rn
    from gbm_percentile_base() b
  ),
  paired as (
    select cur.player_id, cur.season_id, cur.season_name, cur.family,
           cur.minutes as cur_minutes, prev.minutes as prev_minutes,
           round(cur.contrib90, 3) as cur_c90, round(prev.contrib90, 3) as prev_c90,
           round(cur.contrib90 - prev.contrib90, 3) as delta,
           prev.season_name as prev_season,
           date_part('year', age(p.date_of_birth)) as age_years,
           (select count(*) from base b2 where b2.player_id = cur.player_id) as seasons_known
    from base cur
    join players p on p.id = cur.player_id
    left join base prev on prev.player_id = cur.player_id and prev.rn = 2
    where cur.rn = 1
  )
  select *,
    case
      when prev_c90 is null then 'INSUFFICIENT_HISTORY'
      when age_years < 23 and delta >= 0.25 and cur_minutes >= 900 then 'BREAKTHROUGH'
      when delta >= 0.10 or (cur_minutes >= prev_minutes * 1.5 and delta >= 0) then 'RISING'
      when delta <= -0.10 then 'DECLINING'
      else 'STABLE'
    end as state
  from paired;

  -- One current development signal per player; earlier ones step down.
  update discovery_signals set is_current = false
   where signal_type = 'DEVELOPMENT_TREND' and is_current;

  insert into discovery_signals
    (player_id, signal_type, score, rationale, evidence, season_id, model_version, is_current)
  select player_id, 'DEVELOPMENT_TREND',
         greatest(0, least(100, round(50 + coalesce(delta, 0) * 100)))::numeric,
         case state
           when 'INSUFFICIENT_HISTORY' then
             'Only one qualifying season (' || season_name || ', ' || cur_minutes || ' min) — no trend can honestly be read yet.'
           when 'BREAKTHROUGH' then
             'Breakthrough: ' || prev_c90 || ' → ' || cur_c90 || ' goal contributions /90 from ' || prev_season || ' to ' || season_name || ' at under 23, on ' || cur_minutes || ' minutes.'
           when 'RISING' then
             'Rising: ' || prev_c90 || ' → ' || cur_c90 || ' /90, minutes ' || prev_minutes || ' → ' || cur_minutes || '.'
           when 'DECLINING' then
             'Declining: ' || prev_c90 || ' → ' || cur_c90 || ' /90 from ' || prev_season || ' to ' || season_name || '.'
           else
             'Stable: ' || prev_c90 || ' → ' || cur_c90 || ' /90 across ' || prev_season || ' → ' || season_name || '.'
         end,
         jsonb_build_object(
           'code', 'DEV_' || state, 'state', state,
           'from_season', prev_season, 'to_season', season_name,
           'from_per90', prev_c90, 'to_per90', cur_c90, 'delta', delta,
           'from_minutes', prev_minutes, 'to_minutes', cur_minutes,
           'age_years', age_years, 'seasons_known', seasons_known,
           'metric', 'goal_contributions_per90'),
         season_id, v_model, true
  from t_dev
  on conflict (player_id, signal_type, model_version, season_id) do update
    set score = excluded.score,
        rationale = excluded.rationale,
        evidence = excluded.evidence,
        is_current = true,
        computed_at = now();
  get diagnostics v_written = row_count;

  return jsonb_build_object(
    'model', v_model, 'written', v_written,
    'states', (select jsonb_object_agg(state, n) from (
       select state, count(*) n from t_dev group by state) s));
end;
$fn$;

comment on function gbm_compute_development is
  'GBM_DEVELOPMENT_V1: RISING / STABLE / DECLINING / BREAKTHROUGH / INSUFFICIENT_HISTORY from season-over-season goal contributions per 90 and minutes, with the reasoning and numbers in evidence. Age gates BREAKTHROUGH; it is context, not a metric.';

revoke all on function gbm_compute_development() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- The quality report learns the statistical checks (17 keys now).
-- ----------------------------------------------------------------------------
create or replace function gbm_data_quality_report()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $fn$
  select jsonb_build_object(
    'generated_at', now(),
    'duplicate_external_ids', (
      select count(*) from (
        select provider_code, namespace, external_id
          from player_external_ids
         group by 1,2,3 having count(distinct player_id) > 1) d),
    'players_sharing_a_provider_id', (
      select count(*) from (
        select player_id, provider_code
          from player_external_ids
         group by 1,2 having count(distinct external_id) > 1) d),
    'duplicate_players_name_dob', (
      select count(*) from (
        select normalized_name, date_of_birth
          from players where date_of_birth is not null
         group by 1,2 having count(*) > 1) d),
    'orphan_source_facts', (
      select count(*) from source_facts f
       where f.entity_type = 'PLAYER'
         and not exists (select 1 from players p where p.id = f.entity_id)),
    'source_records_unlinked', (
      select count(*) from source_records where player_id is null),
    'stats_without_competition', (
      select count(*) from player_season_stats where competition_id is null),
    'contracts_expiring_in_the_past', (
      select count(*) from contracts
       where expires_on is not null and expires_on < current_date - interval '2 years'
         and status = 'ACTIVE'),
    'market_values_dated_in_the_future', (
      select count(*) from market_values where valued_on > current_date + 1),
    'duplicate_current_representation', (
      select count(*) from (
        select player_id from representation_records
         where is_current group by player_id having count(*) > 1) d),
    'players_with_club_outside_their_league', (
      select count(*) from players p
       join clubs c on c.id = p.current_club_id
       join competitions comp on comp.id = p.cached_competition_id
       where c.country_id is not null and comp.country_id is not null
         and c.country_id <> comp.country_id),
    'cache_name_id_mismatch', (
      select count(*) from players p
       left join competitions c on c.id = p.cached_competition_id
       where p.cached_league is not null
         and (p.cached_competition_id is null or c.name is distinct from p.cached_league)),
    'unresolved_merge_conflicts', (
      select count(*) from player_merge_conflicts where reviewed_at is null),
    'merge_survivors_needing_reingest', (
      select count(*) from v_merge_recovery_queue
       where recovery_state in ('PENDING', 'PARTIAL')),
    'merge_recovery_manual_review', (
      select count(*) from v_merge_recovery_queue
       where recovery_state = 'MANUAL_REVIEW'),

    -- Statistical sanity ----------------------------------------------------
    'stats_minutes_exceed_possible', (
      select count(*) from player_season_stats
       where minutes_played is not null and matches_played is not null
         and matches_played > 0 and minutes_played > matches_played * 120),
    'percentiles_below_cohort_floor', (
      select count(*) from player_percentiles
       where model_version = 'POSITION_PERCENTILE_V1' and peer_group_size < 30),
    'performance_scores_out_of_range', (
      select count(*) from player_percentiles
       where model_version in ('POSITION_PERCENTILE_V1', 'GBM_PERFORMANCE_V1')
         and (percentile < 0 or percentile > 100))
  );
$fn$;

comment on function gbm_data_quality_report is
  'Seventeen data-quality counts as one jsonb answer, read by both the application and the ingestion workflow. Counts, never repairs.';

revoke all on function gbm_data_quality_report() from public, anon;
grant execute on function gbm_data_quality_report() to authenticated;

-- ----------------------------------------------------------------------------
-- The guard: run the engines against live data and check their promises.
-- ----------------------------------------------------------------------------
do $$
declare
  v_claude_before bigint;
  v_pct jsonb; v_perf jsonb; v_dev jsonb;
  v_bad bigint; v_claude bigint; v_report jsonb; v_missing text;
begin
  select count(*) into v_claude_before from player_percentiles where peer_group like 'CLAUDE:%';

  v_pct := gbm_compute_percentiles();
  v_perf := gbm_compute_performance_score();
  v_dev := gbm_compute_development();

  if (v_pct ->> 'written')::int < 1000 then
    raise exception 'percentile engine wrote only % rows — cohorts collapsed', v_pct ->> 'written';
  end if;

  -- The floors are promises, not aspirations.
  select count(*) into v_bad from player_percentiles
   where model_version = 'POSITION_PERCENTILE_V1' and peer_group_size < 30;
  if v_bad > 0 then raise exception '% percentile rows below the 30-player cohort floor', v_bad; end if;

  select count(*) into v_bad from player_percentiles
   where model_version = 'POSITION_PERCENTILE_V1'
     and ((cohort ->> 'player_minutes')::int < 450 or percentile < 0 or percentile > 100);
  if v_bad > 0 then raise exception '% percentile rows violate the minutes floor or the 0–100 range', v_bad; end if;

  -- No metric outside its catalog families: a goalkeeper must never carry a
  -- shots percentile, a striker never a saves one.
  select count(*) into v_bad
    from player_percentiles pp
    join metric_catalog mc on mc.metric_key = pp.metric_key
   where pp.model_version = 'POSITION_PERCENTILE_V1'
     and not (pp.cohort ->> 'family') = any (mc.families);
  if v_bad > 0 then
    raise exception '% percentile rows rank a metric outside its catalog families', v_bad;
  end if;

  -- The old model's rows are evidence, and they must be exactly untouched.
  select count(*) into v_claude from player_percentiles where peer_group like 'CLAUDE:%';
  if v_claude <> v_claude_before then
    raise exception 'CLAUDE rows changed (% -> %) — the old model was to be left in place',
      v_claude_before, v_claude;
  end if;

  -- Every documented check key present, the three statistical ones included.
  v_report := gbm_data_quality_report();
  select string_agg(k, ', ') into v_missing from unnest(array[
    'duplicate_external_ids','players_sharing_a_provider_id','duplicate_players_name_dob',
    'orphan_source_facts','source_records_unlinked','stats_without_competition',
    'contracts_expiring_in_the_past','market_values_dated_in_the_future',
    'duplicate_current_representation','players_with_club_outside_their_league',
    'cache_name_id_mismatch','unresolved_merge_conflicts',
    'merge_survivors_needing_reingest','merge_recovery_manual_review',
    'stats_minutes_exceed_possible','percentiles_below_cohort_floor',
    'performance_scores_out_of_range'
  ]) k where not v_report ? k;
  if v_missing is not null then
    raise exception 'the data quality report is missing checks: %', v_missing;
  end if;
  if (v_report ->> 'percentiles_below_cohort_floor')::int <> 0
     or (v_report ->> 'performance_scores_out_of_range')::int <> 0 then
    raise exception 'statistical checks are non-zero immediately after compute';
  end if;
end $$;
