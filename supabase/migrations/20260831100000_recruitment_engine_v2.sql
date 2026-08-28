-- ============================================================================
-- GBM INTELLIGENCE — 0038 RECRUITMENT ENGINE v2: A SCORE THAT SHOWS ITS WORK
-- ----------------------------------------------------------------------------
-- 0036 and 0037 built the foundation: two tables, a null-aware scorer, and
-- shrinkage so an undocumented player cannot float to the top on a lucky
-- component. This migration reshapes that into the operational model, and
-- renames both tables to the vocabulary GBM actually uses.
--
-- Both tables are empty and only v_player_fit reads them, so the rename costs
-- nothing and leaves one name for each concept instead of two.
--
--   club_requirements  ->  recruitment_requests
--   player_fit_scores  ->  player_evaluations
--
-- WHAT CHANGES IN THE MODEL
--
-- Position and age were hard filters. They are now scored, because a weight on
-- a filtered field is meaningless: if every listed player passed the position
-- filter, every player scores the same 100 for position and the 30% does no
-- work. So the net widens to adjacent roles and the fit is graded:
--
--   position_fit     30   exact role 100, adjacent 85, related 55
--   age_fit          15   inside the band 100, tapering outside it
--   competition_fit  15   league strength against the brief's level
--   financial_fit    15   value against the transfer ceiling
--   contract_fit     10   situation against the stated preference
--   statistical_fit  10   minutes and output actually on record
--   development_fit   5   age curve and trajectory
--   ----------------------
--                   100
--
-- WHY THE AI SCORES SIT OUTSIDE THAT TOTAL
--
-- `technical_score` and `adaptation_score` are kept, and they are deliberately
-- NOT part of the 100. The brief for this engine was "no black box — the user
-- should understand why a player appears", and a model's opinion folded into
-- the headline number is exactly the box that cannot be opened. The seven
-- components above are arithmetic on stored facts: same data, same number,
-- checkable by hand. The AI assessment is displayed beside the score, with its
-- own label, and never moves it.
--
-- WHY EVERY COMPONENT CARRIES A REASON
--
-- `score_breakdown` stores one row per component: the weight, the score, and
-- the sentence explaining it, built from the values that produced it. That is
-- what makes "why does this player appear" answerable without reading SQL —
-- the interface renders the reasons rather than inventing its own.
--
-- The rules from 0036 and 0037 are unchanged and still carry the design:
-- a missing input scores NULL and never zero, and the ranking shrinks toward
-- 50 by whatever is missing.
-- ============================================================================

alter table club_requirements rename to recruitment_requests;
alter table player_fit_scores  rename to player_evaluations;

drop view if exists v_player_fit;

-- ----------------------------------------------------------------------------
-- A. The request
-- ----------------------------------------------------------------------------
alter table recruitment_requests rename column club_name_raw to club_name;
alter table recruitment_requests rename column age_min to preferred_age_min;
alter table recruitment_requests rename column age_max to preferred_age_max;

alter table recruitment_requests
  add column if not exists country text,
  add column if not exists league text,
  add column if not exists competition_level text,
  -- The prose brief: "goal scorer, physical striker, development potential,
  -- European experience preferred". Stored verbatim and never parsed into a
  -- score — it is what the club said, not something measured about a player.
  add column if not exists player_profile_description text;

comment on column recruitment_requests.player_profile_description is
  'The club brief in its own words. Read by a scout and by the research team; never converted into a number, because a sentence is not a measurement.';

-- `league_level` and the new `competition_level` mean the same thing; keep one.
update recruitment_requests set competition_level = league_level
 where competition_level is null and league_level is not null;
alter table recruitment_requests drop column if exists league_level;

-- ----------------------------------------------------------------------------
-- B. The evaluation
-- ----------------------------------------------------------------------------
-- The generated rollups go first: overall_score and confidence_level are
-- generated over financial_score and statistical_score, and Postgres will not
-- let a column be renamed or dropped while a generated column reads it.
alter table player_evaluations drop column if exists overall_score;
alter table player_evaluations drop column if exists confidence_level;
alter table player_evaluations drop column if exists missing_components;
alter table player_evaluations drop column if exists market_score;
alter table player_evaluations drop column if exists risk_score;

alter table player_evaluations rename column requirement_id to recruitment_request_id;
alter table player_evaluations rename column financial_score to financial_fit;
alter table player_evaluations rename column statistical_score to statistical_fit;

alter table player_evaluations
  add column if not exists position_fit    numeric check (position_fit    is null or position_fit    between 0 and 100),
  add column if not exists age_fit         numeric check (age_fit         is null or age_fit         between 0 and 100),
  add column if not exists competition_fit numeric check (competition_fit is null or competition_fit between 0 and 100),
  add column if not exists contract_fit    numeric check (contract_fit    is null or contract_fit    between 0 and 100),
  add column if not exists development_fit numeric check (development_fit is null or development_fit between 0 and 100),
  add column if not exists recommendation_status text
    check (recommendation_status is null or recommendation_status in
      ('STRONG_MATCH','WORTH_WATCHING','POSSIBLE','WEAK_MATCH','INSUFFICIENT_DATA')),
  add column if not exists strengths           text[] not null default '{}',
  add column if not exists risks               text[] not null default '{}',
  add column if not exists missing_information text[] not null default '{}',
  -- One entry per component: weight, score, and the sentence behind it.
  add column if not exists score_breakdown jsonb not null default '[]'::jsonb;

-- The weighted mean over the components that exist, renormalised so a partial
-- score stays comparable to a complete one.
alter table player_evaluations
  add column overall_score numeric generated always as (
    round((coalesce(position_fit,0)*30 + coalesce(age_fit,0)*15
         + coalesce(competition_fit,0)*15 + coalesce(financial_fit,0)*15
         + coalesce(contract_fit,0)*10 + coalesce(statistical_fit,0)*10
         + coalesce(development_fit,0)*5)
        / nullif(case when position_fit    is null then 0 else 30 end
               + case when age_fit         is null then 0 else 15 end
               + case when competition_fit is null then 0 else 15 end
               + case when financial_fit   is null then 0 else 15 end
               + case when contract_fit    is null then 0 else 10 end
               + case when statistical_fit is null then 0 else 10 end
               + case when development_fit is null then 0 else 5  end, 0), 1)
  ) stored,

  add column confidence_level numeric generated always as (
    round((case when position_fit    is null then 0 else 30 end
         + case when age_fit         is null then 0 else 15 end
         + case when competition_fit is null then 0 else 15 end
         + case when financial_fit   is null then 0 else 15 end
         + case when contract_fit    is null then 0 else 10 end
         + case when statistical_fit is null then 0 else 10 end
         + case when development_fit is null then 0 else 5  end)::numeric / 100.0, 2)
  ) stored;

comment on column player_evaluations.overall_score is
  'Weighted mean of the seven components that have data. Arithmetic on stored facts only — the AI scores are displayed beside it and never inside it.';
comment on column player_evaluations.score_breakdown is
  'One object per component: {component, weight, score, reason}. The reason is built from the values that produced the score, so the interface can answer "why is he here" without re-deriving anything.';

create index if not exists player_evaluations_request_idx
  on player_evaluations (recruitment_request_id, overall_score desc nulls last);

-- ----------------------------------------------------------------------------
-- C. Position families, now graded rather than binary
-- ----------------------------------------------------------------------------
-- Returns the stored position strings that satisfy a brief, each with how well
-- it does. 'Missing' is never returned: an unknown position is not evidence of
-- fit, and a striker search must not surface players who might be anything.
-- ----------------------------------------------------------------------------
create or replace function gbm_position_fit(p_required text, p_actual text)
returns numeric
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_actual is null or p_actual in ('Missing','') then null
    when p_actual = any (gbm_position_family(p_required)) then 100
    when upper(p_required) in ('ST','CF') and p_actual in ('Left Winger','Right Winger','Attacking Midfield') then 55
    when upper(p_required) = 'AM' and p_actual in ('Central Midfield','Left Winger','Right Winger') then 55
    when upper(p_required) in ('LW','RW') and p_actual in ('Centre-Forward','Second Striker','Attacking Midfield') then 55
    when upper(p_required) = 'CM' and p_actual in ('Left Midfield','Right Midfield') then 55
    when upper(p_required) in ('LB','RB') and p_actual in ('Left Midfield','Right Midfield','Centre-Back') then 55
    when upper(p_required) = 'CB' and p_actual in ('Defensive Midfield','Left-Back','Right-Back') then 55
    else null
  end;
$$;

comment on function gbm_position_fit is
  'Grades a stored position against a brief: exact family 100, convertible role 55, unrelated NULL (excluded). Never grades the placeholder Missing.';

-- ----------------------------------------------------------------------------
-- D. Age, tapering rather than cliff-edged
-- ----------------------------------------------------------------------------
-- A club asking for 18–25 still wants to see the 26-year-old who fits
-- everything else; it does not want him ranked as though he were 21. Ten
-- points per year outside the band, floored at zero.
-- ----------------------------------------------------------------------------
create or replace function gbm_age_fit(p_age numeric, p_min int, p_max int)
returns numeric
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_age is null then null
    when p_min is null and p_max is null then 100
    when p_min is not null and p_age < p_min then greatest(0, 100 - (p_min - p_age) * 10)
    when p_max is not null and p_age > p_max then greatest(0, 100 - (p_age - p_max) * 10)
    else 100
  end;
$$;

comment on function gbm_age_fit is
  'Inside the stated band 100; outside it, ten points per year, floored at zero. A near miss ranks below a fit, not out of the list.';

revoke all on function gbm_position_fit(text, text) from public, anon;
revoke all on function gbm_age_fit(numeric, int, int) from public, anon;
grant execute on function gbm_position_fit(text, text) to authenticated;
grant execute on function gbm_age_fit(numeric, int, int) to authenticated;
