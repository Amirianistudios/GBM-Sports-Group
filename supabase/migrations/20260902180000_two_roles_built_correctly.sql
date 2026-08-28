-- ============================================================================
-- GBM INTELLIGENCE — 0053 TWO ROLES, BUILT CORRECTLY
-- ----------------------------------------------------------------------------
-- Role fit, model GBM_ROLE_FIT_V1 — and only two roles, because two is what
-- the data can honestly support:
--
--   FINISHER   does the player put the ball in the net at rate — goals,
--              shot volume, xG where it exists.
--   CREATOR    does the player make goals for others — assists and key
--              passes.
--
-- Both are computed from the same POSITION_PERCENTILE_V1 rows the
-- performance score reads, so they inherit every cohort guarantee (family,
-- season, 450-minute floor, 30-player cohorts) and stay explainable.
--
-- What is deliberately NOT here: a BALL_WINNER, a DEEP_PLAYMAKER, a
-- SWEEPER_KEEPER. Tackles and interceptions exist for ~1,175 season rows,
-- progressive actions and duels for none — a defensive role built on that
-- would be a relabeled guess. Roles are added to this file's successor when
-- a licensed provider supplies the inputs, not before.
--
-- ROLE FIT is not PERFORMANCE: a striker can be an elite FINISHER with a
-- middling overall season, and a CM can be a strong CREATOR while his
-- performance summary is dragged by discipline. The two numbers answer
-- different questions and are stored under different model versions.
-- ============================================================================

create or replace function gbm_compute_role_fit()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $fn$
declare
  v_started timestamptz := clock_timestamp();
  v_model constant text := 'GBM_ROLE_FIT_V1';
  -- Per-role metric weights. A role applies only to families whose football
  -- includes the job; a CB is never scored as a FINISHER.
  v_roles constant jsonb := '{
    "FINISHER": {
      "families": ["AM", "WINGER", "STRIKER"],
      "weights": {"goals_per90": 0.55, "shots_per90": 0.25, "xg_per90": 0.2}
    },
    "CREATOR": {
      "families": ["FB_WB", "DM", "CM", "AM", "WINGER", "STRIKER"],
      "weights": {"assists_per90": 0.5, "key_passes_per90": 0.5}
    }
  }'::jsonb;
  v_written int;
  v_deleted int;
begin
  create temp table t_fit on commit drop as
  with roles as (
    select key as role_key,
           value -> 'weights' as weights,
           (select array_agg(f) from jsonb_array_elements_text(value -> 'families') f) as families
    from jsonb_each(v_roles)
  ),
  metric_rows as (
    select pp.player_id, pp.season_id,
           pp.cohort ->> 'family' as family,
           pp.cohort ->> 'season' as season_name,
           (pp.cohort ->> 'player_minutes')::int as minutes,
           pp.metric_key, pp.percentile, pp.confidence
    from player_percentiles pp
    where pp.model_version = 'POSITION_PERCENTILE_V1'
  ),
  weighted as (
    select m.player_id, m.season_id, m.family, m.season_name, m.minutes,
           r.role_key, m.metric_key, m.percentile, m.confidence,
           (r.weights ->> m.metric_key)::numeric as w
    from metric_rows m
    join roles r on m.family = any (r.families) and r.weights ? m.metric_key
  ),
  scored as (
    select player_id, season_id, family, season_name, role_key,
           min(minutes) as minutes,
           count(*) as metrics_used,
           round(sum(percentile * w) / nullif(sum(w), 0), 1) as fit,
           bool_and(confidence = 'HIGH') as all_high,
           jsonb_object_agg(metric_key,
             jsonb_build_object('percentile', round(percentile, 1), 'weight', w)) as components
    from weighted
    group by player_id, season_id, family, season_name, role_key
    -- A role fit over a single metric is that metric wearing a costume;
    -- two of a role's metrics is the floor.
    having count(*) >= 2
  )
  select * from scored;

  insert into player_percentiles
    (player_id, season_id, metric_key, raw_value, per90_value, percentile,
     peer_group, peer_group_size, model_version, confidence, cohort, computed_at)
  select player_id, season_id, 'ROLE_FIT:' || role_key, metrics_used, null, fit,
         'GBM:ROLE:' || role_key || ':' || family || ':' || season_name,
         metrics_used, v_model,
         case when all_high then 'HIGH' when metrics_used >= 2 then 'MEDIUM' else 'LOW' end,
         jsonb_build_object('family', family, 'season', season_name, 'role', role_key,
                            'components', components, 'metrics_used', metrics_used,
                            'player_minutes', minutes),
         clock_timestamp()
  from t_fit
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

comment on function gbm_compute_role_fit is
  'GBM_ROLE_FIT_V1: FINISHER and CREATOR fit from POSITION_PERCENTILE_V1 rows — the only two roles the current metric coverage can support honestly. Distinct from the performance summary by design; components recorded on every row.';

revoke all on function gbm_compute_role_fit() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- The guard: run it, and assert the honesty rules held.
-- ----------------------------------------------------------------------------
do $$
declare v jsonb; v_bad bigint; v_remaining bigint;
begin
  v := gbm_compute_role_fit();

  select count(*) into v_remaining from player_percentiles
   where model_version = 'GBM_ROLE_FIT_V1';
  if v_remaining < 100 then
    raise exception 'only % role-fit rows survived the run', v_remaining;
  end if;

  -- No role outside its families: a goalkeeper or centre-back must carry no
  -- FINISHER fit.
  select count(*) into v_bad from player_percentiles
   where model_version = 'GBM_ROLE_FIT_V1'
     and metric_key = 'ROLE_FIT:FINISHER'
     and (cohort ->> 'family') not in ('AM', 'WINGER', 'STRIKER');
  if v_bad > 0 then
    raise exception '% FINISHER rows outside the attacking families', v_bad;
  end if;

  select count(*) into v_bad from player_percentiles
   where model_version = 'GBM_ROLE_FIT_V1'
     and (percentile < 0 or percentile > 100 or peer_group_size < 2);
  if v_bad > 0 then
    raise exception '% role-fit rows out of range or under the two-metric floor', v_bad;
  end if;
end $$;
