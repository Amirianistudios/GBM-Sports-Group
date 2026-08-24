-- ============================================================================
-- GBM INTELLIGENCE — 0029 SOURCE TYPES A NEWS MONITOR CAN ACTUALLY USE
-- ----------------------------------------------------------------------------
-- `player_news.source_type` was written for the hourly connectors, whose items
-- arrive from a club site, a federation, a provider API, an RSS feed or a
-- dataset. An external team monitoring news and social media has nothing
-- honest to put there, and two concrete faults follow from that:
--
--   1. gbm_intel_submit() defaults the column to 'AI_RESEARCH', which the
--      CHECK constraint rejects. Every NEWS submission that omits
--      `source_type` — the common case — is therefore refused, and the caller
--      gets WRITE_FAILED with a constraint error rather than a stored row.
--      The default was never legal; nothing had exercised it.
--
--   2. A newspaper report and a post on X are the substance of "news and
--      social monitoring", and neither has a value. Forcing them into 'RSS'
--      records the transport instead of the source, and 'MANUAL' says a human
--      typed it, which is not what happened.
--
-- Three values are added:
--
--   NEWS_MEDIA  — a publication: newspaper, broadcaster, transfer journalist.
--   SOCIAL      — a post: the player, the club, an agent, a reporter's feed.
--   AI_RESEARCH — the item has no citable external source; the research is the
--                 source. This is the honest label for the case the brief
--                 describes, where scraping is unavailable and the material is
--                 assembled rather than fetched. It is deliberately distinct
--                 from `agent_id`: `source_type` says where a claim came from,
--                 `agent_id` says who collected it. A newspaper read by the AI
--                 team is NEWS_MEDIA collected by an agent, not AI_RESEARCH.
--
-- Widening a CHECK cannot invalidate an existing row, so this is safe on the
-- live table.
-- ============================================================================

alter table player_news drop constraint if exists player_news_source_type_check;

alter table player_news add constraint player_news_source_type_check
  check (source_type in (
    'OFFICIAL_CLUB', 'FEDERATION', 'PROVIDER_API', 'RSS', 'DATASET', 'MANUAL',
    'NEWS_MEDIA', 'SOCIAL', 'AI_RESEARCH'));

comment on column player_news.source_type is
  'Where the claim came from. Distinct from agent_id, which is who collected it: a newspaper read by the AI team is NEWS_MEDIA, not AI_RESEARCH. AI_RESEARCH is only for material with no citable external source.';

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
-- The fault above was a default in one file disagreeing with a constraint in
-- another, which no test could see because neither file is wrong on its own.
-- This asserts the two agree, so the next person to add a default finds out
-- here rather than from a rejected submission.
-- ----------------------------------------------------------------------------
do $$
declare
  v_default text;
  v_allowed text;
begin
  select pg_get_functiondef(oid) into v_default
    from pg_proc where proname = 'gbm_intel_submit'
     and pronamespace = 'public'::regnamespace;

  select pg_get_constraintdef(con.oid) into v_allowed
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
   where rel.relname = 'player_news' and con.conname = 'player_news_source_type_check';

  -- The literal the function falls back to when a submission omits the field.
  if v_default ~ 'coalesce\(v_data->>''source_type'', ''([A-Z_]+)''\)' then
    declare
      v_lit text := (regexp_match(v_default, 'coalesce\(v_data->>''source_type'', ''([A-Z_]+)''\)'))[1];
    begin
      if position(quote_literal(v_lit) in v_allowed) = 0 then
        raise exception
          'gbm_intel_submit() defaults player_news.source_type to %, which player_news_source_type_check does not allow. Every NEWS submission omitting source_type would be rejected. Allowed: %',
          v_lit, v_allowed;
      end if;
    end;
  end if;
end $$;
