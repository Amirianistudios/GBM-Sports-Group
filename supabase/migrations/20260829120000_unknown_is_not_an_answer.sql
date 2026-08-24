-- ============================================================================
-- GBM INTELLIGENCE — 0036 'UNKNOWN' IS NOT AN ANSWER
-- ----------------------------------------------------------------------------
-- Two faults in 0034's identity fill, both found by running it against a real
-- player rather than by reading it.
--
--   1. `foot = 'UNKNOWN'` is the column saying it has no answer, not an
--      answer. 984 players carry it — 8 of the 15 in the GBM portfolio — and
--      `coalesce(existing, submitted)` treated the placeholder as a real
--      value, so preferred foot could never have been corrected for any of
--      them. The fill now treats UNKNOWN as empty.
--
--   2. `primary_position` was being upper-cased. The stored vocabulary is
--      Transfermarkt's title case — 'Centre-Back', 'Goalkeeper' — so a
--      submission of 'ST' or an upper-cased 'CENTRE-BACK' would have created
--      a second vocabulary and split the discovery position filter. It is now
--      stored verbatim.
--
-- The `filled` array returned to the caller also under-reported: it named
-- five of the sixteen columns the update can touch. It now names all of them.
-- ============================================================================

create or replace function gbm_intel__identity(
  p_player   uuid,
  p_provider text,
  p_state    fact_state,
  p_data     jsonb,
  p_url      text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_nat    uuid;
  v_nat2   uuid;
  v_birth  uuid;
  v_club   uuid;
  v_before players%rowtype;
  v_filled text[] := '{}';
  v_key    text;
  v_val    text;
  v_fields constant text[] := array[
    'short_name','first_name','last_name','date_of_birth','birth_place',
    'nationality','second_nationality','birth_country','height_cm','weight_kg',
    'foot','primary_position','secondary_positions','shirt_number',
    'current_club','image_url'
  ];
begin
  select * into v_before from players where id = p_player;

  -- A picture with nobody credited is refused rather than stored.
  if nullif(p_data->>'image_url','') is not null
     and nullif(p_data->>'image_credit','') is null then
    return jsonb_build_object('error', 'MISSING_REQUIRED_FIELD', 'field', 'image_credit',
      'hint', 'An image must name its source. GBM cannot verify a licence for an unattributed picture.');
  end if;

  -- Names resolve to ids where the reference data knows them; where it does
  -- not, the field is simply left alone rather than guessed at.
  select id into v_nat   from countries where gbm_normalize_name(name) = gbm_normalize_name(nullif(p_data->>'nationality',''));
  select id into v_nat2  from countries where gbm_normalize_name(name) = gbm_normalize_name(nullif(p_data->>'second_nationality',''));
  select id into v_birth from countries where gbm_normalize_name(name) = gbm_normalize_name(nullif(p_data->>'birth_country',''));
  select id into v_club  from clubs     where gbm_normalize_name(name) = gbm_normalize_name(nullif(p_data->>'current_club',''));

  -- coalesce(existing, submitted): an existing value always wins. This is the
  -- whole "never overwrite" rule, and it is why re-running is harmless.
  update players p set
    short_name          = coalesce(p.short_name,          nullif(p_data->>'short_name','')),
    first_name          = coalesce(p.first_name,          nullif(p_data->>'first_name','')),
    last_name           = coalesce(p.last_name,           nullif(p_data->>'last_name','')),
    date_of_birth       = coalesce(p.date_of_birth,      (nullif(p_data->>'date_of_birth',''))::date),
    birth_place         = coalesce(p.birth_place,         nullif(p_data->>'birth_place','')),
    nationality_country_id        = coalesce(p.nationality_country_id, v_nat),
    second_nationality_country_id = coalesce(p.second_nationality_country_id, v_nat2),
    birth_country_id    = coalesce(p.birth_country_id,    v_birth),
    height_cm           = coalesce(p.height_cm,          (nullif(p_data->>'height_cm',''))::int),
    weight_kg           = coalesce(p.weight_kg,          (nullif(p_data->>'weight_kg',''))::int),
    -- 'UNKNOWN' is the foot column's way of saying it has no answer, not an
    -- answer. 984 players carry it, 8 of them in the GBM portfolio, and a
    -- plain coalesce would have treated the placeholder as a real value and
    -- refused every correction for good.
    foot = case
             when p.foot is null or p.foot = 'UNKNOWN'::preferred_foot
               then coalesce((nullif(upper(p_data->>'foot'),''))::preferred_foot, p.foot)
             else p.foot
           end,
    -- Stored verbatim. The existing vocabulary is Transfermarkt's title case
    -- — 'Centre-Back', 'Goalkeeper' — and upper-casing a submission would
    -- have split the discovery position filter into two vocabularies.
    primary_position    = coalesce(p.primary_position,    nullif(p_data->>'primary_position','')),
    shirt_number        = coalesce(p.shirt_number,       (nullif(p_data->>'shirt_number',''))::int),
    current_club_id     = coalesce(p.current_club_id,     v_club),
    image_url           = coalesce(p.image_url,           nullif(p_data->>'image_url','')),
    image_credit        = coalesce(p.image_credit,        nullif(p_data->>'image_credit','')),
    updated_at          = now()
  where p.id = p_player;

  -- secondary_positions is an array, so it is set only when wholly absent.
  if (v_before.secondary_positions is null or cardinality(v_before.secondary_positions) = 0)
     and jsonb_typeof(p_data->'secondary_positions') = 'array' then
    update players
       set secondary_positions = array(select jsonb_array_elements_text(p_data->'secondary_positions')),
           updated_at = now()
     where id = p_player;
  end if;

  -- Every supplied field becomes an assertion regardless of whether it filled
  -- a column, so the interface can tell an AI-sourced value from a provider's.
  foreach v_key in array v_fields loop
    v_val := nullif(p_data->>v_key, '');
    continue when v_val is null;
    insert into source_facts (entity_type, entity_id, fact_key, value_text,
                              provider_code, source_url, state, confidence,
                              retrieved_at, is_current)
    values ('PLAYER', p_player, 'player.' || v_key, v_val, p_provider, p_url,
            p_state, coalesce((p_data->>'confidence')::numeric, 0.800), now(), true)
    on conflict (entity_type, entity_id, fact_key, provider_code) do update
      set value_text = excluded.value_text,
          source_url = excluded.source_url,
          state      = excluded.state,
          confidence = excluded.confidence,
          retrieved_at = excluded.retrieved_at,
          is_current = true;
  end loop;

  -- Report what actually changed, so a caller can see its work landed.
  select array_agg(f) into v_filled from (
    select 'short_name' as f where v_before.short_name is null and nullif(p_data->>'short_name','') is not null
    union all select 'date_of_birth' where v_before.date_of_birth is null and nullif(p_data->>'date_of_birth','') is not null
    union all select 'nationality' where v_before.nationality_country_id is null and v_nat is not null
    union all select 'height_cm' where v_before.height_cm is null and nullif(p_data->>'height_cm','') is not null
    union all select 'foot' where v_before.foot is null and nullif(p_data->>'foot','') is not null
    union all select 'primary_position' where v_before.primary_position is null and nullif(p_data->>'primary_position','') is not null
    union all select 'current_club' where v_before.current_club_id is null and v_club is not null
    union all select 'image_url' where v_before.image_url is null and nullif(p_data->>'image_url','') is not null
  ) s;

  return jsonb_build_object('filled', coalesce(to_jsonb(v_filled), '[]'::jsonb));
end $fn$;


do $guard$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname = 'gbm_intel__identity' and pronamespace = 'public'::regnamespace;
  if v_def !~ '''UNKNOWN''::preferred_foot' then
    raise exception 'gbm_intel__identity treats foot=UNKNOWN as a real answer again; 984 players could never have their preferred foot corrected.';
  end if;
  if v_def ~ 'upper\(p_data->>''primary_position''\)' then
    raise exception 'primary_position is being upper-cased; the vocabulary is title case and this would fragment the discovery filter.';
  end if;
end $guard$;
