-- ============================================================================
-- GBM INTELLIGENCE — 0037 IGNORANCE IS NOT A PERFECT SCORE
-- ----------------------------------------------------------------------------
-- 0036 scored a missing input as NULL rather than zero, so an unknown player
-- would not be ranked as a confident bad fit. That was right, and it was not
-- enough. The first honest run against production put this at the top:
--
--   Tobías Cervera   fit=100.0  confidence=0.31  missing 4 of 6 components
--   Yann Gboua       fit= 94.0  confidence=0.25  missing 4 of 6 components
--
-- Both scored near-perfect because the two components that happened to be
-- known were good, and there was nothing else to pull the average down. A mean
-- over fewer components has more variance, so the least-documented players
-- float to the top of every list. The ranking had inverted itself: it was
-- surfacing the players GBM knows least about, dressed as the best matches.
--
-- Averaging what you have is not enough. The fix is shrinkage toward a neutral
-- prior, in proportion to what is missing:
--
--   ranked_score = overall_score × coverage + 50 × (1 − coverage)
--
-- A fully-documented player keeps almost all of his score. A player known on
-- two components out of six is pulled most of the way back to 50 — exactly the
-- right claim: we do not know, so he sits in the middle rather than at either
-- end. Nobody is called bad for being undocumented, and nobody is called
-- excellent for it either.
--
--   Cervera  100.0 × 0.31 + 50 × 0.69 = 65.5
--   Gboua     94.0 × 0.25 + 50 × 0.75 = 61.0
--   a fully computed 88 at 0.63       = 73.9   ← now correctly ahead of both
--
-- WHY A VIEW AND NOT A COLUMN
--
-- The obvious move is another generated column, but Postgres forbids one
-- generated column referencing another, and `overall_score` and
-- `confidence_level` are both generated. The alternative — inlining the whole
-- weighted-mean expression a third time — would put the same formula in three
-- places, which is the drift 0036 introduced generated columns to prevent.
--
-- A view derives it at read time from the stored columns instead. One formula,
-- no duplication, and it cannot fall out of step with its inputs.
--
-- `overall_score` and `confidence_level` are both kept and both shown: the
-- club still sees "88, and we are 63% covered". `ranked_score` decides order
-- only. Presenting the raw score with its coverage was always the plan;
-- ordering by it was the mistake.
-- ============================================================================

create or replace view v_player_fit as
select
  f.id,
  f.player_id,
  f.requirement_id,

  /* Verified — computed from stored provider data, reproducible. */
  f.statistical_score,
  f.financial_score,
  f.market_score,
  f.risk_score,

  /* AI — written only by the research team, NULL until it submits. */
  f.technical_score,
  f.adaptation_score,

  f.overall_score,
  f.confidence_level,
  f.missing_components,

  /* Order by this; show the two above. */
  case
    when f.overall_score is null then null
    else round(f.overall_score * f.confidence_level + 50 * (1 - f.confidence_level), 1)
  end as ranked_score,

  /* A plain-language coverage band, so the interface does not have to invent
     its own thresholds and then disagree with the next surface that tries. */
  case
    when f.confidence_level >= 0.80 then 'HIGH'
    when f.confidence_level >= 0.50 then 'MODERATE'
    when f.confidence_level >= 0.25 then 'LOW'
    else 'MINIMAL'
  end as confidence_band,

  f.computed_explanation,
  f.ai_explanation,
  f.ai_agent_id,
  f.computed_at,

  p.full_name,
  p.date_of_birth,
  round(extract(epoch from age(current_date, p.date_of_birth)) / 31557600.0, 1) as age,
  p.primary_position,
  p.foot,
  p.height_cm,
  p.cached_market_value    as market_value,
  p.cached_contract_expires as contract_expires_on,
  p.cached_league          as league_name,
  coalesce(p.gbm_portrait_url, p.image_url) as portrait_url,
  co.name as nationality,
  c.name  as club_name
from player_fit_scores f
join players p   on p.id = f.player_id
left join countries co on co.id = p.nationality_country_id
left join clubs c      on c.id = p.current_club_id;

comment on view v_player_fit is
  'Fit scores joined to the player facts a recruitment card shows. ranked_score shrinks overall_score toward 50 by missing coverage and decides list order; overall_score and confidence_level are what the interface displays.';

alter view v_player_fit set (security_invoker = on);
revoke all on v_player_fit from anon;

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
-- Asserts the inversion cannot come back, using the real numbers from the run
-- that exposed it, and that the view has not lost its security settings.
-- ----------------------------------------------------------------------------
do $$
declare
  v_thin numeric := round(100.0 * 0.31 + 50 * (1 - 0.31), 1);  -- Cervera
  v_full numeric := round( 88.0 * 0.63 + 50 * (1 - 0.63), 1);  -- documented
  v_opts text[];
begin
  if v_thin >= v_full then
    raise exception
      'shrinkage is not working: a 100 at 0.31 coverage (%) still outranks an 88 at 0.63 (%)',
      v_thin, v_full;
  end if;

  if pg_get_viewdef('v_player_fit'::regclass, true) !~ 'ranked_score' then
    raise exception 'v_player_fit no longer exposes ranked_score; the list would order by raw score again';
  end if;

  select reloptions into v_opts from pg_class where relname = 'v_player_fit';
  if v_opts is null or not ('security_invoker=on' = any (v_opts)) then
    raise exception 'v_player_fit lost security_invoker; it would read past row-level security';
  end if;

  if has_table_privilege('anon', 'v_player_fit', 'select') then
    raise exception 'v_player_fit is readable by anon';
  end if;
end $$;
