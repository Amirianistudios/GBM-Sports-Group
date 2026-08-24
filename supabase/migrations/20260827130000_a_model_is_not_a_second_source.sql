-- ============================================================================
-- GBM INTELLIGENCE — 0032 A MODEL IS NOT A SECOND SOURCE
-- ----------------------------------------------------------------------------
-- `player_fact_conflicts` groups every current row in `source_facts` by fact
-- key and reports a conflict wherever the distinct values exceed one. It was
-- written when every row in that table came from a provider, so grouping them
-- all together was the same as grouping providers.
--
-- The external research team changes that. Its assertions land in the same
-- table with `state = 'AI_ASSESSED'`, and two things follow that the interface
-- must not show:
--
--   · A model that read Transfermarkt and repeated its value would be counted
--     as a second source agreeing with Transfermarkt. One source becomes two,
--     and the corroboration stripe on the player header says a fact is better
--     attested than it is.
--
--   · A model that got it wrong would raise "Sources disagree" against the
--     site it was summarising, presenting its own error as a conflict between
--     two providers.
--
-- Both are the failure CLAUDE.md names: scout and model opinion mixing with
-- provider statistics. The AI's contribution belongs in the intel_* tables and
-- the AI Intelligence tab, where nothing competes with it and every item says
-- who produced it.
--
-- So conflicts are computed from what providers reported. `source_facts` still
-- holds the AI row — nothing is discarded, and provider_fact_priority still
-- decides what is displayed — it simply does not get a vote on whether two
-- providers agree.
--
-- The matching count on the player header is filtered in the same way, in
-- `apps/web/src/app/players/[id]/page.tsx`.
-- ============================================================================

create or replace view player_fact_conflicts as
  select
    entity_id as player_id,
    fact_key,
    count(distinct coalesce(value_text, value_numeric::text, value_date::text)) as distinct_values,
    count(*) as source_count,
    jsonb_agg(jsonb_build_object(
      'provider', provider_code,
      'value', coalesce(value_text, value_numeric::text, value_date::text),
      'url', source_url,
      'retrieved', retrieved_at
    ) order by provider_code) as sources
  from source_facts f
  where entity_type = 'PLAYER'::entity_type
    and is_current
    -- A conflict is a disagreement between sources. An assessment is not one.
    and state <> 'AI_ASSESSED'::fact_state
  group by entity_id, fact_key
  having count(distinct coalesce(value_text, value_numeric::text, value_date::text)) > 1;

-- `create or replace view` keeps options and grants, but this view was one of
-- the five that leaked to `anon` before 0007, so both are re-asserted rather
-- than assumed.
alter view player_fact_conflicts set (security_invoker = on);
revoke select on player_fact_conflicts from anon;

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_opts text[];
begin
  select pg_get_viewdef('player_fact_conflicts'::regclass, true) into v_def;
  if v_def !~ 'AI_ASSESSED' then
    raise exception
      'player_fact_conflicts no longer excludes AI_ASSESSED. A model repeating a provider would count as a second source, and a model disagreeing with one would show as a conflict between providers.';
  end if;

  select reloptions into v_opts from pg_class where relname = 'player_fact_conflicts';
  if v_opts is null or not ('security_invoker=on' = any (v_opts)) then
    raise exception 'player_fact_conflicts lost security_invoker; it would read past row-level security.';
  end if;

  if has_table_privilege('anon', 'player_fact_conflicts', 'select') then
    raise exception 'player_fact_conflicts is readable by anon.';
  end if;
end $$;
