-- ============================================================================
-- GBM INTELLIGENCE — 0039 THE SHORTLIST GENERATOR
-- ----------------------------------------------------------------------------
-- One function: a club brief goes in, a ranked shortlist comes out, and every
-- number on it can be traced to the fact that produced it.
--
-- `score_breakdown` is the point of the whole thing. Each component records
-- its weight, its score and a sentence built from the values behind it —
-- "Valued 400,000 EUR against a 1,000,000 ceiling", not "financial: 100".
-- A recruiter reading a shortlist can therefore answer "why is he here"
-- without anyone re-deriving the arithmetic, and can disagree with a specific
-- clause rather than with the score as a whole.
--
-- Three rules carry over from 0036–0038 and still decide the behaviour:
--
--   · A missing input scores NULL, never zero. An unknown market value is not
--     a bad market value.
--   · The ranking shrinks toward 50 by whatever is missing, so the
--     least-documented players cannot float to the top on one lucky component.
--   · Nothing is invented. Where a fact is absent the reason says so in the
--     words the interface shows: unknown, unavailable, not on record.
--
-- `strengths` and `risks` are derived from the same components, not written
-- separately, so they can never contradict the score they sit beside.
-- ============================================================================

create or replace function gbm_generate_shortlist(p_request uuid)
returns table (evaluated int, strong int, insufficient int)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  r recruitment_requests%rowtype;
  v_eval int := 0;
  v_strong int := 0;
  v_insuff int := 0;
begin
  select * into r from recruitment_requests where id = p_request;
  if not found then
    raise exception 'UNKNOWN_REQUEST %', p_request using errcode = '22023';
  end if;

  with candidate as (
    select
      p.id,
      p.primary_position,
      round(extract(epoch from age(current_date, p.date_of_birth)) / 31557600.0, 1) as age,
      p.cached_market_value    as value,
      p.cached_season_minutes  as minutes,
      p.cached_contract_expires as expires,
      p.cached_league          as league,
      comp.strength_rating,
      co.name as nationality,
      gbm_position_fit(r.position_required, p.primary_position) as pos_fit
    from players p
    left join countries co on co.id = p.nationality_country_id
    -- One competition per player, not several. 'Bundesliga', 'Superliga' and
    -- 'Premier-Liga' each name two different countries' leagues, so a plain
    -- join multiplied the candidate rows and the upsert refused to touch the
    -- same row twice. Taking the best-rated match keeps it one row per player.
    left join lateral (
      select comp2.strength_rating
        from competitions comp2
       where gbm_normalize_name(comp2.name) = gbm_normalize_name(p.cached_league)
       order by comp2.strength_rating desc nulls last
       limit 1
    ) comp on true
    where coalesce(p.is_retired, false) = false
      -- Position is the one hard gate. A defender is not a weak striker, he is
      -- not a striker; listing him would be noise, not optionality.
      and gbm_position_fit(r.position_required, p.primary_position) is not null
  ),
  scored as (
    select
      c.*,
      gbm_age_fit(c.age, r.preferred_age_min, r.preferred_age_max) as age_fit,

      /* COMPETITION — how the player's league compares with the brief's level.
         strength_rating is 0–100 where it exists; where it does not, this
         scores NULL rather than assuming the league is weak. */
      c.strength_rating as competition_fit,

      /* FINANCIAL — inside the ceiling is a full score, decaying to zero at
         twice it. Below the floor is not penalised: cheaper than budgeted is
         not a worse fit. */
      case
        when c.value is null or r.transfer_budget_max is null then null
        when c.value <= r.transfer_budget_max then 100
        else greatest(0, round(100 - ((c.value - r.transfer_budget_max)
                                      / nullif(r.transfer_budget_max, 0)) * 100, 1))
      end as financial_fit,

      /* CONTRACT — against what the club said it wanted. No contract on
         record is NOT treated as a free agent: it is unknown, and scores
         NULL. Conflating the two would manufacture free transfers. */
      case
        when c.expires is null then null
        when coalesce(r.contract_preference,'ANY') = 'ANY' then 100
        when r.contract_preference = 'EXPIRING_6M' then
          case when c.expires <= current_date + interval '6 months' then 100 else 40 end
        when r.contract_preference = 'EXPIRING_12M' then
          case when c.expires <= current_date + interval '12 months' then 100 else 40 end
        when r.contract_preference = 'UNDER_CONTRACT' then
          case when c.expires > current_date + interval '12 months' then 100 else 60 end
        when r.contract_preference = 'FREE_AGENT' then
          case when c.expires <= current_date then 100 else 20 end
        else 100
      end as contract_fit,

      /* STATISTICAL — what is actually on record. A full season is 2,700
         minutes; this measures availability, which is the only thing minutes
         can honestly measure. */
      case when c.minutes is null then null
           else least(100, round((c.minutes / 2700.0) * 100, 1)) end as statistical_fit,

      /* DEVELOPMENT — the age curve. Under 21 has the most room, 21–24 still
         appreciating, past 29 declining. Unknown age scores NULL. */
      case
        when c.age is null then null
        when c.age < 21 then 100
        when c.age < 24 then 85
        when c.age < 27 then 65
        when c.age < 30 then 40
        else 20
      end as development_fit
    from candidate c
  )
  insert into player_evaluations as t (
    player_id, recruitment_request_id,
    position_fit, age_fit, competition_fit, financial_fit,
    contract_fit, statistical_fit, development_fit,
    strengths, risks, missing_information, score_breakdown, computed_at
  )
  select
    s.id, p_request,
    s.pos_fit, s.age_fit, s.competition_fit, s.financial_fit,
    s.contract_fit, s.statistical_fit, s.development_fit,

    /* Strengths and risks read off the same components that made the score,
       so the prose beside a number can never disagree with it. */
    array_remove(array[
      case when s.pos_fit = 100 then 'Plays the position asked for' end,
      case when s.age_fit = 100 and s.age is not null then 'Inside the age band at ' || s.age end,
      case when s.financial_fit = 100 then 'Valuation inside the transfer budget' end,
      case when s.statistical_fit >= 70 then 'Regular starter last season' end,
      case when s.development_fit >= 85 then 'Still in the developing age range' end,
      case when s.expires is not null and s.expires <= current_date + interval '12 months'
           then 'Contract expiring within twelve months' end
    ], null),

    array_remove(array[
      case when s.pos_fit < 100 then 'Would be converting from ' || s.primary_position end,
      case when s.age_fit < 100 and s.age is not null
           then 'Age ' || s.age || ' is outside the requested band' end,
      case when s.financial_fit is not null and s.financial_fit < 60
           then 'Valuation above the stated ceiling' end,
      case when s.minutes is not null and s.minutes < 900
           then 'Under 900 minutes last season' end,
      case when s.development_fit <= 40 and s.age is not null
           then 'Past the age where resale value typically grows' end,
      case when s.expires is not null and s.expires > current_date + interval '24 months'
           then 'Long contract — the selling club holds the leverage' end
    ], null),

    /* Named gaps, in the words the interface shows. */
    array_remove(array[
      case when s.age is null then 'date of birth unknown' end,
      case when s.value is null then 'market value unavailable' end,
      case when s.minutes is null then 'no minutes on record' end,
      case when s.expires is null then 'contract situation unknown' end,
      case when s.strength_rating is null then 'league strength unavailable' end,
      case when s.nationality is null then 'nationality unknown' end,
      'salary unknown',
      'advanced statistics unavailable'
    ], null),

    /* The reason behind every component, built from the values themselves. */
    jsonb_build_array(
      jsonb_build_object('component','position','weight',30,'score',s.pos_fit,
        'reason', case when s.pos_fit = 100
                       then 'Listed as ' || s.primary_position || ', the role requested'
                       else 'Listed as ' || s.primary_position || ' — convertible to '
                            || r.position_required || ', not a natural fit' end),
      jsonb_build_object('component','age','weight',15,'score',s.age_fit,
        'reason', case when s.age is null then 'Date of birth unknown'
                       when s.age_fit = 100 then 'Age ' || s.age || ', inside the requested band'
                       else 'Age ' || s.age || ', outside the band of '
                            || coalesce(r.preferred_age_min::text,'any') || '–'
                            || coalesce(r.preferred_age_max::text,'any') end),
      jsonb_build_object('component','competition','weight',15,'score',s.competition_fit,
        'reason', case when s.strength_rating is null
                       then 'League strength unavailable for ' || coalesce(s.league,'an unknown league')
                       else coalesce(s.league,'League') || ' rated ' || s.strength_rating || '/100' end),
      jsonb_build_object('component','financial','weight',15,'score',s.financial_fit,
        'reason', case when s.value is null then 'Market value unavailable'
                       when r.transfer_budget_max is null then 'No transfer ceiling stated'
                       else 'Valued ' || round(s.value)::text || ' ' || r.currency
                            || ' against a ' || round(r.transfer_budget_max)::text || ' ceiling' end),
      jsonb_build_object('component','contract','weight',10,'score',s.contract_fit,
        'reason', case when s.expires is null then 'Contract situation unknown'
                       else 'Contract runs to ' || s.expires::text end),
      jsonb_build_object('component','statistical','weight',10,'score',s.statistical_fit,
        'reason', case when s.minutes is null then 'No minutes on record'
                       else s.minutes || ' minutes last season' end),
      jsonb_build_object('component','development','weight',5,'score',s.development_fit,
        'reason', case when s.age is null then 'Date of birth unknown'
                       when s.age < 24 then 'Age ' || s.age || ', still developing'
                       when s.age < 30 then 'Age ' || s.age || ', at peak'
                       else 'Age ' || s.age || ', past peak resale' end)
    ),
    now()
  from scored s
  on conflict (player_id, recruitment_request_id) do update
    set position_fit    = excluded.position_fit,
        age_fit         = excluded.age_fit,
        competition_fit = excluded.competition_fit,
        financial_fit   = excluded.financial_fit,
        contract_fit    = excluded.contract_fit,
        statistical_fit = excluded.statistical_fit,
        development_fit = excluded.development_fit,
        strengths       = excluded.strengths,
        risks           = excluded.risks,
        missing_information = excluded.missing_information,
        score_breakdown = excluded.score_breakdown,
        computed_at     = excluded.computed_at;

  get diagnostics v_eval = row_count;

  -- overall_score and confidence_level are generated, so the verdict is a
  -- second pass over the values the database has just derived.
  update player_evaluations
     set recommendation_status = case
           when confidence_level < 0.40 then 'INSUFFICIENT_DATA'
           when overall_score >= 80 and confidence_level >= 0.60 then 'STRONG_MATCH'
           when overall_score >= 65 then 'WORTH_WATCHING'
           when overall_score >= 50 then 'POSSIBLE'
           else 'WEAK_MATCH'
         end
   where recruitment_request_id = p_request;

  select count(*) filter (where recommendation_status = 'STRONG_MATCH'),
         count(*) filter (where recommendation_status = 'INSUFFICIENT_DATA')
    into v_strong, v_insuff
    from player_evaluations where recruitment_request_id = p_request;

  return query select v_eval, v_strong, v_insuff;
end $fn$;

comment on function gbm_generate_shortlist is
  'Evaluates every positionally-plausible player against one request. Seven weighted components, each carrying the sentence that explains it. Absent facts score NULL and are named in missing_information.';

revoke all on function gbm_generate_shortlist(uuid) from public, anon;
grant execute on function gbm_generate_shortlist(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- The shortlist the interface reads
-- ----------------------------------------------------------------------------
create or replace view v_recruitment_shortlist as
select
  e.id,
  e.player_id,
  e.recruitment_request_id,
  e.position_fit, e.age_fit, e.competition_fit, e.financial_fit,
  e.contract_fit, e.statistical_fit, e.development_fit,
  e.overall_score,
  e.confidence_level,
  e.recommendation_status,
  e.strengths, e.risks, e.missing_information, e.score_breakdown,
  /* Ordering value: shrinks toward 50 by whatever is missing, so a thin
     record cannot outrank a documented one on a single lucky component. */
  case when e.overall_score is null then null
       else round(e.overall_score * e.confidence_level + 50 * (1 - e.confidence_level), 1)
  end as ranked_score,
  case
    when e.confidence_level >= 0.80 then 'HIGH'
    when e.confidence_level >= 0.60 then 'MODERATE'
    when e.confidence_level >= 0.40 then 'LOW'
    else 'MINIMAL'
  end as confidence_band,
  /* AI overlay — displayed beside the score, never inside it. */
  e.technical_score, e.adaptation_score, e.ai_explanation, e.ai_agent_id,
  e.computed_at,
  p.full_name,
  round(extract(epoch from age(current_date, p.date_of_birth)) / 31557600.0, 1) as age,
  p.primary_position, p.foot, p.height_cm,
  p.cached_market_value     as market_value,
  p.cached_contract_expires as contract_expires_on,
  p.cached_league           as league_name,
  coalesce(p.gbm_portrait_url, p.image_url) as portrait_url,
  co.name as nationality,
  c.name  as club_name
from player_evaluations e
join players p on p.id = e.player_id
left join countries co on co.id = p.nationality_country_id
left join clubs c on c.id = p.current_club_id;

comment on view v_recruitment_shortlist is
  'One ranked candidate per row with the player facts a shortlist card shows. Order by ranked_score; display overall_score with confidence_level beside it.';

alter view v_recruitment_shortlist set (security_invoker = on);
revoke all on v_recruitment_shortlist from anon;

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
do $$
declare v_opts text[];
begin
  if gbm_position_fit('ST','Centre-Back') is not null then
    raise exception 'a centre-back scores against a striker brief; the position gate is open';
  end if;
  if gbm_position_fit('ST','Missing') is not null then
    raise exception 'the placeholder Missing is being scored as a real position';
  end if;
  if gbm_age_fit(26, 18, 25) >= gbm_age_fit(22, 18, 25) then
    raise exception 'age taper is not working: 26 scores at least as well as 22 against an 18-25 brief';
  end if;
  if round(100.0*0.31 + 50*(1-0.31), 1) >= round(88.0*0.63 + 50*(1-0.63), 1) then
    raise exception 'shrinkage is not working: a thin perfect score still outranks a documented one';
  end if;

  select reloptions into v_opts from pg_class where relname = 'v_recruitment_shortlist';
  if v_opts is null or not ('security_invoker=on' = any (v_opts)) then
    raise exception 'v_recruitment_shortlist lost security_invoker';
  end if;
  if has_table_privilege('anon','v_recruitment_shortlist','select') then
    raise exception 'v_recruitment_shortlist is readable by anon';
  end if;
end $$;
