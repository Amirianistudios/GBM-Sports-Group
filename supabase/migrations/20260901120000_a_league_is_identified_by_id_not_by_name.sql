-- ============================================================================
-- GBM INTELLIGENCE — 0042 A LEAGUE IS IDENTIFIED BY ID, NOT BY NAME
-- ----------------------------------------------------------------------------
-- `players.cached_league` holds a league *name*, and every consumer that needed
-- the league's properties had to match that name back against `competitions`.
-- League names are not unique across countries, so that match is ambiguous:
--
--     bundesliga      Germany / Austria
--     premier-liga    Russia  / Ukraine
--     superliga       Denmark / Uzbekistan (as a prefix)
--
-- The ambiguity has produced two bugs already. In 0039 the plain join
-- multiplied candidate rows until the upsert refused to touch the same row
-- twice, and was patched with `order by strength_rating desc limit 1` — take
-- the best-rated namesake. In 0041 the same join pooled two countries' squads
-- into one median, so Austria was handed Germany's league strength.
--
-- 0041 fixed its own join by going through `player_season_stats.competition_id`
-- and gave Russia 46.0 and Ukraine 40.1, correctly and separately. That fix
-- turned 0039's patch into an active defect: `strength_rating desc` now means
-- all 265 Ukrainian Premier Liga players silently score against Russia's 46.0.
-- The higher number always wins, so the error only ever inflates.
--
-- Patching the tie-break a second time would leave the same trap set for the
-- next reader. The name is simply the wrong key, so this migration stops using
-- it as one: the refresh already knows which competition row a player's minutes
-- belong to, and it now keeps the id instead of throwing it away.
--
--   * `players.cached_competition_id` is the real foreign key.
--   * `cached_league` stays, and is now derived *from* that id, so the name a
--     surface prints and the rating it scores can no longer disagree.
--   * `gbm_generate_shortlist()` joins the id and drops the lateral entirely.
--
-- Nothing else about either function changes: same columns, same per-player
-- latest-season rule from 0040, same scoring.
-- ============================================================================

alter table players
  add column if not exists cached_competition_id uuid
    references competitions(id) on delete set null;

comment on column players.cached_competition_id is
  'The competition the player played most minutes in during his own latest season. Written by gbm_refresh_player_caches(); the key to join competitions on. cached_league is this row''s name and must not be matched back by hand.';

-- An index because the shortlist joins every candidate on it.
create index if not exists players_cached_competition_id_idx
  on players (cached_competition_id)
  where cached_competition_id is not null;

-- ----------------------------------------------------------------------------
-- The refresh keeps the id
-- ----------------------------------------------------------------------------
create or replace function gbm_refresh_player_caches()
returns integer
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '300s'
as $function$
declare
  n integer;
begin
  update players p
  set (cached_market_value, cached_value_change_pct, cached_season_minutes,
       cached_competition_id, cached_league, cached_contract_expires,
       cached_opportunity, caches_refreshed_at)
    = (select
         val.value_amount,
         case when yr.value_amount > 0
              then round((val.value_amount - yr.value_amount) / yr.value_amount * 100, 1)
         end,
         cur.season_minutes,
         cur.competition_id,
         curc.name,
         ct.expires_on,
         sig.score,
         now()
       from (select 1) one
       left join lateral (
         select mv.value_amount from market_values mv
         where mv.player_id = p.id
         order by mv.valued_on desc limit 1
       ) val on true
       left join lateral (
         select mv.value_amount from market_values mv
         where mv.player_id = p.id and mv.valued_on <= current_date - interval '1 year'
         order by mv.valued_on desc limit 1
       ) yr on true
       -- This player's own latest season, and the minutes and competition that
       -- go with it. Ordering by end_date first lets '2026' (a calendar-year
       -- league that has already finished) and '2026/2027' (in progress) be
       -- compared by when they actually ran rather than by how they are spelt.
       --
       -- The aggregate now yields the competition *id*. The name is read from
       -- that row below rather than aggregated alongside it, so the two cannot
       -- come from different competitions on a minutes tie.
       left join lateral (
         select
           sum(s.minutes_played)::int as season_minutes,
           (array_agg(s.competition_id order by s.minutes_played desc nulls last))[1]
             as competition_id
         from player_season_stats s
         join seasons se on se.id = s.season_id
         where s.player_id = p.id
           and se.id = (
             select se2.id
             from player_season_stats s2
             join seasons se2 on se2.id = s2.season_id
             where s2.player_id = p.id and s2.minutes_played is not null
             order by se2.end_date desc nulls last, se2.name desc
             limit 1
           )
         group by se.id
       ) cur on true
       left join competitions curc on curc.id = cur.competition_id
       left join lateral (
         select co.expires_on from contracts co
         where co.player_id = p.id and co.expires_on > current_date
         order by co.expires_on asc limit 1
       ) ct on true
       left join lateral (
         select ds.score from discovery_signals ds
         where ds.player_id = p.id and ds.is_current
           and ds.signal_type = 'GBM_OPPORTUNITY'
         order by ds.computed_at desc limit 1
       ) sig on true)
  where p.id is not null; -- always true: satisfies pg_safeupdate on the RPC path

  get diagnostics n = row_count;
  return n;
end;
$function$;

comment on function gbm_refresh_player_caches is
  'Refreshes the cached player columns. Each player''s current season is his own most recent season with minutes — a global max(season.name) silenced every player outside one season and every calendar-year league. Caches the competition id, and derives cached_league from it.';

-- Populate the new column before anything reads it.
select gbm_refresh_player_caches();

-- ----------------------------------------------------------------------------
-- The shortlist joins the key
-- ----------------------------------------------------------------------------
create or replace function gbm_generate_shortlist(p_request uuid)
returns table(evaluated integer, strong integer, insufficient integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r recruitment_requests%rowtype;
  v_eval int := 0; v_strong int := 0; v_insuff int := 0;
begin
  select * into r from recruitment_requests where id = p_request;
  if not found then
    raise exception 'UNKNOWN_REQUEST %', p_request using errcode = '22023';
  end if;

  with candidate as (
    select p.id, p.primary_position,
      round(extract(epoch from age(current_date, p.date_of_birth)) / 31557600.0, 1) as age,
      p.cached_market_value as value, p.cached_season_minutes as minutes,
      p.cached_contract_expires as expires,
      coalesce(comp.name, p.cached_league) as league,
      comp.strength_rating, co.name as nationality,
      gbm_position_fit(r.position_required, p.primary_position) as pos_fit
    from players p
    left join countries co on co.id = p.nationality_country_id
    -- One competition per player because it is a foreign key, not a name
    -- lookup. The lateral this replaces took the best-rated namesake, which
    -- handed every Ukrainian Premier Liga player Russia's rating the moment
    -- 0041 gave the two leagues different numbers.
    left join competitions comp on comp.id = p.cached_competition_id
    where coalesce(p.is_retired, false) = false
      and gbm_position_fit(r.position_required, p.primary_position) is not null
  ),
  scored as (
    select c.*,
      gbm_age_fit(c.age, r.preferred_age_min, r.preferred_age_max) as age_fit,
      c.strength_rating as competition_fit,
      case when c.value is null or r.transfer_budget_max is null then null
           when c.value <= r.transfer_budget_max then 100
           else greatest(0, round(100 - ((c.value - r.transfer_budget_max)
                / nullif(r.transfer_budget_max, 0)) * 100, 1)) end as financial_fit,
      case when c.expires is null then null
           when coalesce(r.contract_preference,'ANY') = 'ANY' then 100
           when r.contract_preference = 'EXPIRING_6M' then
             case when c.expires <= current_date + interval '6 months' then 100 else 40 end
           when r.contract_preference = 'EXPIRING_12M' then
             case when c.expires <= current_date + interval '12 months' then 100 else 40 end
           when r.contract_preference = 'UNDER_CONTRACT' then
             case when c.expires > current_date + interval '12 months' then 100 else 60 end
           when r.contract_preference = 'FREE_AGENT' then
             case when c.expires <= current_date then 100 else 20 end
           else 100 end as contract_fit,
      case when c.minutes is null then null
           else least(100, round((c.minutes / 2700.0) * 100, 1)) end as statistical_fit,
      case when c.age is null then null when c.age < 21 then 100 when c.age < 24 then 85
           when c.age < 27 then 65 when c.age < 30 then 40 else 20 end as development_fit
    from candidate c
  )
  insert into player_evaluations as t (
    player_id, recruitment_request_id, position_fit, age_fit, competition_fit,
    financial_fit, contract_fit, statistical_fit, development_fit,
    strengths, risks, missing_information, score_breakdown, computed_at)
  select s.id, p_request, s.pos_fit, s.age_fit, s.competition_fit, s.financial_fit,
    s.contract_fit, s.statistical_fit, s.development_fit,
    array_remove(array[
      case when s.pos_fit = 100 then 'Plays the position asked for' end,
      case when s.age_fit = 100 and s.age is not null then 'Inside the age band at ' || s.age end,
      case when s.financial_fit = 100 then 'Valuation inside the transfer budget' end,
      case when s.statistical_fit >= 70 then 'Regular starter last season' end,
      case when s.development_fit >= 85 then 'Still in the developing age range' end,
      case when s.expires is not null and s.expires <= current_date + interval '12 months'
           then 'Contract expiring within twelve months' end], null),
    array_remove(array[
      case when s.pos_fit < 100 then 'Would be converting from ' || s.primary_position end,
      case when s.age_fit < 100 and s.age is not null then 'Age ' || s.age || ' is outside the requested band' end,
      case when s.financial_fit is not null and s.financial_fit < 60 then 'Valuation above the stated ceiling' end,
      case when s.minutes is not null and s.minutes < 900 then 'Under 900 minutes last season' end,
      case when s.development_fit <= 40 and s.age is not null then 'Past the age where resale value typically grows' end,
      case when s.expires is not null and s.expires > current_date + interval '24 months'
           then 'Long contract - the selling club holds the leverage' end], null),
    array_remove(array[
      case when s.age is null then 'date of birth unknown' end,
      case when s.value is null then 'market value unavailable' end,
      case when s.minutes is null then 'no minutes on record' end,
      case when s.expires is null then 'contract situation unknown' end,
      case when s.strength_rating is null then 'league strength unavailable' end,
      case when s.nationality is null then 'nationality unknown' end,
      'salary unknown', 'advanced statistics unavailable'], null),
    jsonb_build_array(
      jsonb_build_object('component','position','weight',30,'score',s.pos_fit,
        'reason', case when s.pos_fit = 100 then 'Listed as ' || s.primary_position || ', the role requested'
                  else 'Listed as ' || s.primary_position || ' - convertible to ' || r.position_required || ', not a natural fit' end),
      jsonb_build_object('component','age','weight',15,'score',s.age_fit,
        'reason', case when s.age is null then 'Date of birth unknown'
                  when s.age_fit = 100 then 'Age ' || s.age || ', inside the requested band'
                  else 'Age ' || s.age || ', outside the band of ' || coalesce(r.preferred_age_min::text,'any')
                       || '-' || coalesce(r.preferred_age_max::text,'any') end),
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
                  else 'Age ' || s.age || ', past peak resale' end)),
    now()
  from scored s
  on conflict (player_id, recruitment_request_id) do update
    set position_fit = excluded.position_fit, age_fit = excluded.age_fit,
        competition_fit = excluded.competition_fit, financial_fit = excluded.financial_fit,
        contract_fit = excluded.contract_fit, statistical_fit = excluded.statistical_fit,
        development_fit = excluded.development_fit, strengths = excluded.strengths,
        risks = excluded.risks, missing_information = excluded.missing_information,
        score_breakdown = excluded.score_breakdown, computed_at = excluded.computed_at;

  get diagnostics v_eval = row_count;

  update player_evaluations
     set recommendation_status = case
           when confidence_level < 0.40 then 'INSUFFICIENT_DATA'
           when overall_score >= 80 and confidence_level >= 0.60 then 'STRONG_MATCH'
           when overall_score >= 65 then 'WORTH_WATCHING'
           when overall_score >= 50 then 'POSSIBLE'
           else 'WEAK_MATCH' end
   where recruitment_request_id = p_request;

  select count(*) filter (where recommendation_status = 'STRONG_MATCH'),
         count(*) filter (where recommendation_status = 'INSUFFICIENT_DATA')
    into v_strong, v_insuff from player_evaluations where recruitment_request_id = p_request;

  return query select v_eval, v_strong, v_insuff;
end $function$;

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
do $$
declare v_n bigint; v_ru numeric; v_ua numeric;
begin
  -- The name must be the id's name. A player carrying a league name that does
  -- not belong to his cached competition is the drift this migration removes.
  select count(*) into v_n
    from players p
    left join competitions c on c.id = p.cached_competition_id
   where p.cached_league is not null
     and (p.cached_competition_id is null or c.name is distinct from p.cached_league);
  if v_n > 0 then
    raise exception 'cached_league disagrees with cached_competition_id for % players', v_n;
  end if;

  -- The specific inflation this migration exists to stop: the two Premier Ligas
  -- must reach their players as different numbers.
  select max(c.strength_rating) filter (where co.name = 'Russia'),
         max(c.strength_rating) filter (where co.name = 'Ukraine')
    into v_ru, v_ua
    from competitions c join countries co on co.id = c.country_id
   where gbm_normalize_name(c.name) = gbm_normalize_name('premier-liga');

  if v_ru is not null and v_ua is not null and v_ru = v_ua then
    raise exception 'the two Premier Ligas hold the same rating (%), so the squads are still pooled', v_ru;
  end if;

  if v_ua is not null and exists (
    select 1 from players p
    join competitions c on c.id = p.cached_competition_id
    join countries co on co.id = c.country_id
    where co.name = 'Ukraine' and c.strength_rating is distinct from v_ua
      and gbm_normalize_name(c.name) = gbm_normalize_name('premier-liga')
  ) then
    raise exception 'a Ukrainian Premier Liga player is not scoring Ukraine''s rating';
  end if;
end $$;
