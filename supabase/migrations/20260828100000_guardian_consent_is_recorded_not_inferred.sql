-- ============================================================================
-- GBM INTELLIGENCE — 0033 GUARDIAN CONSENT IS RECORDED, NOT INFERRED
-- ----------------------------------------------------------------------------
-- The portfolio card warned "Minor — guardian consent required" for every
-- player under 18. That warning was computed from the date of birth alone, so
-- it fired whether or not consent had been obtained, and nothing but a
-- birthday could make it stop.
--
-- `player_guardians` already models the real thing — guardian name, contact,
-- consent reference, `consent_on_file` — and stays the place for it. But
-- `guardian_name` is `not null`, so recording "we hold consent" through that
-- table would mean inventing a person's name. GBM has confirmed consent is
-- held without supplying the paperwork, and a fabricated guardian is worse
-- than no guardian row at all.
--
-- So the assertion goes on `gbm_portfolio`, which is GBM's record of the
-- relationship rather than a record about the guardian. It is deliberately
-- weaker than `player_guardians.consent_on_file`: that column means "we have
-- the signed document and here is its reference", this one means "GBM states
-- consent is held". The card distinguishes them, so nobody reads the badge as
-- evidence of paperwork the platform has never seen. Entering the documents
-- later upgrades the card on its own.
--
-- The warning now depends on the assertion instead of the birthday, so it
-- also behaves correctly for the next minor GBM signs: present until someone
-- records consent, and never silenced by the passage of time.
-- ============================================================================

alter table gbm_portfolio
  add column if not exists guardian_consent_on_file  boolean not null default false,
  add column if not exists guardian_consent_noted_at timestamptz,
  add column if not exists guardian_consent_noted_by uuid references auth.users(id) on delete set null;

comment on column gbm_portfolio.guardian_consent_on_file is
  'GBM asserts signed guardian consent is held for this minor. Weaker than player_guardians.consent_on_file, which also carries the document reference. The interface labels the difference.';

-- ----------------------------------------------------------------------------
-- The view the portfolio reads
-- ----------------------------------------------------------------------------
-- Reproduced from the installed definition with two columns added and nothing
-- else altered — the card depends on the cached columns, the live-status
-- fields and both image fallbacks, and dropping any of them silently empties
-- half the page.
--
--   guardian_consent    — either source says consent is held
--   guardian_documented — the paperwork itself is recorded, not just asserted
-- ----------------------------------------------------------------------------
create or replace view v_gbm_portfolio as
 SELECT gp.player_id,
    gp.status,
    gp.representation_start,
    gp.representation_end,
    gp.assigned_staff_id,
    prof.full_name AS assigned_staff_name,
    gp.verification_note,
    gp.verified_at,
    gp.notes,
    p.full_name,
    p.date_of_birth,
    round(EXTRACT(epoch FROM age(CURRENT_DATE::timestamp with time zone, p.date_of_birth::timestamp with time zone)) / 31557600.0, 1) AS age,
    p.date_of_birth IS NOT NULL AND p.date_of_birth > (CURRENT_DATE - '18 years'::interval) AS is_minor,
    p.primary_position,
    p.height_cm,
    p.foot,
    nat.name AS nationality,
    c.name AS club_name,
    p.cached_league AS league_name,
    p.cached_market_value AS market_value,
    p.cached_value_change_pct AS value_change_12m_pct,
    p.cached_contract_expires AS contract_expires_on,
        CASE
            WHEN p.cached_contract_expires IS NOT NULL THEN round((p.cached_contract_expires - CURRENT_DATE)::numeric / 30.44)
            ELSE NULL::numeric
        END AS contract_months_remaining,
    COALESCE(p.gbm_hero_image_url, p.gbm_portrait_url, p.image_url) AS hero_image_url,
    COALESCE(p.gbm_portrait_url, p.image_url) AS portrait_url,
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
    ( SELECT count(*) AS count
           FROM player_news n
          WHERE n.player_id = gp.player_id AND n.discovered_at > (now() - '7 days'::interval)) AS news_last_7d,
    -- Appended, not inserted: CREATE OR REPLACE VIEW may only add columns at
    -- the end, so position here is a constraint of the statement, not taste.
    gp.guardian_consent_on_file OR (EXISTS ( SELECT 1
           FROM player_guardians g
          WHERE g.player_id = gp.player_id AND g.consent_on_file)) AS guardian_consent,
    (EXISTS ( SELECT 1
           FROM player_guardians g
          WHERE g.player_id = gp.player_id AND g.consent_on_file)) AS guardian_documented
   FROM gbm_portfolio gp
     JOIN players p ON p.id = gp.player_id
     LEFT JOIN profiles prof ON prof.id = gp.assigned_staff_id
     LEFT JOIN countries nat ON nat.id = p.nationality_country_id
     LEFT JOIN clubs c ON c.id = p.current_club_id
     LEFT JOIN player_live_status ls ON ls.player_id = gp.player_id;

alter view v_gbm_portfolio set (security_invoker = on);
revoke select on v_gbm_portfolio from anon;

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
-- Also checks the columns the card would silently lose if this view were ever
-- rewritten from memory rather than from the installed definition.
-- ----------------------------------------------------------------------------
do $$
declare
  v_cols    text[];
  v_opts    text[];
  v_missing text := '';
  v_needed  constant text[] := array[
    'guardian_consent','guardian_documented','is_minor','hero_image_url','portrait_url',
    'market_value','contract_months_remaining','league_name','assigned_staff_name',
    'value_change_12m_pct','news_last_7d','latest_minutes'
  ];
  v_col text;
begin
  select array_agg(attname::text) into v_cols
    from pg_attribute
   where attrelid = 'v_gbm_portfolio'::regclass and attnum > 0 and not attisdropped;

  foreach v_col in array v_needed loop
    if not (v_col = any (v_cols)) then
      v_missing := v_missing || v_col || ' ';
    end if;
  end loop;

  if v_missing <> '' then
    raise exception 'v_gbm_portfolio is missing columns the portfolio card reads: %', v_missing;
  end if;

  select reloptions into v_opts from pg_class where relname = 'v_gbm_portfolio';
  if v_opts is null or not ('security_invoker=on' = any (v_opts)) then
    raise exception 'v_gbm_portfolio lost security_invoker; it would read past row-level security.';
  end if;

  if has_table_privilege('anon', 'v_gbm_portfolio', 'select') then
    raise exception 'v_gbm_portfolio is readable by anon.';
  end if;
end $$;
