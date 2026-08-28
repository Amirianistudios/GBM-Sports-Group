-- ============================================================================
-- GBM INTELLIGENCE — 0052 THE ENGINE MUST NOT EAT ITS OWN ROWS
-- ----------------------------------------------------------------------------
-- 0051's engines stamped rows with now() — which in Postgres is the
-- TRANSACTION start time — and then removed "stale" rows older than
-- v_started, captured with clock_timestamp() when the function began. Since
-- a transaction starts before any function inside it runs, every freshly
-- written row was already "older" than v_started, and the stale-sweep
-- deleted the run's own output the moment it finished writing it.
--
-- 0051's guard missed it because it checked the INSERT's row_count (counted
-- before the sweep) and floors over what remained — and floors over an empty
-- set pass trivially. The development signals survived only because their
-- lifecycle is an is_current flip, not a delete.
--
-- Two changes, one lesson:
--   · rows are stamped with clock_timestamp(), which moves inside a
--     transaction, so a row written after v_started is provably newer;
--   · the guard now asserts what REMAINS after the sweep, not what was
--     briefly inserted.
-- ============================================================================

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
  )
  select * from vals where value is not null;

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
         -- clock_timestamp(), never now(): now() is the transaction start,
         -- which predates v_started, and the sweep below would then remove
         -- the rows this very statement writes. That is not a hypothetical —
         -- it is exactly what 0051 did.
         clock_timestamp()
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

  delete from player_percentiles
   where model_version = v_model and computed_at < v_started;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'model', v_model, 'written', v_written, 'stale_removed', v_deleted,
    'remaining', (select count(*) from player_percentiles where model_version = v_model),
    'skipped_below_cohort_floor', v_skipped_small);
end;
$fn$;

comment on function gbm_compute_percentiles is
  'POSITION_PERCENTILE_V1: family × season × strength-band cohorts (fallback: whole family-season), 450-minute floor, 30-player cohort floor, catalog-driven metrics, every row versioned and carrying its cohort. Never touches CLAUDE:% rows. Rows stamped with clock_timestamp so the stale-sweep cannot eat the run''s own output (the 0051 defect).';

revoke all on function gbm_compute_percentiles() from public, anon, authenticated;

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
         clock_timestamp()
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

  return jsonb_build_object('model', v_model, 'written', v_written, 'stale_removed', v_deleted,
    'remaining', (select count(*) from player_percentiles where model_version = v_model));
end;
$fn$;

comment on function gbm_compute_performance_score is
  'GBM_PERFORMANCE_V1: one 0–100 summary of a player''s POSITION_PERCENTILE_V1 set, weighted per family and renormalised over the metrics he actually has (minimum three). Components recorded on the row. Rows stamped with clock_timestamp so the stale-sweep cannot eat the run''s own output.';

revoke all on function gbm_compute_performance_score() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- The guard: run both engines and assert on what SURVIVES them.
-- ----------------------------------------------------------------------------
do $$
declare
  v_pct jsonb; v_perf jsonb; v_remaining bigint; v_bad bigint; v_claude bigint;
begin
  select count(*) into v_claude from player_percentiles where peer_group like 'CLAUDE:%';

  v_pct := gbm_compute_percentiles();
  v_perf := gbm_compute_performance_score();

  select count(*) into v_remaining from player_percentiles
   where model_version = 'POSITION_PERCENTILE_V1';
  if v_remaining < 1000 then
    raise exception 'only % percentile rows SURVIVED the run — the sweep is still eating them', v_remaining;
  end if;

  select count(*) into v_remaining from player_percentiles
   where model_version = 'GBM_PERFORMANCE_V1';
  if v_remaining < 100 then
    raise exception 'only % performance scores survived the run', v_remaining;
  end if;

  select count(*) into v_bad from player_percentiles
   where model_version = 'POSITION_PERCENTILE_V1'
     and (peer_group_size < 30 or percentile < 0 or percentile > 100
          or (cohort ->> 'player_minutes')::int < 450);
  if v_bad > 0 then
    raise exception '% surviving rows violate the floors', v_bad;
  end if;

  if (select count(*) from player_percentiles where peer_group like 'CLAUDE:%') <> v_claude then
    raise exception 'CLAUDE rows changed — the old model was to be left in place';
  end if;
end $$;
