-- ============================================================================
-- GBM INTELLIGENCE — 0046 FIVE MORE IDENTITY PROVIDERS
-- ----------------------------------------------------------------------------
-- The Reep register is CC0 and carries 5,868,269 cross-provider bridges, of
-- which the resolver consumes seven providers. Measured against 297 of GBM's
-- own Transfermarkt ids on release 20260826T221009Z, 296 resolve to a Reep
-- identity — 99.7% — and each one reaches considerably more than seven:
--
--     opta person          290/296   98%
--     wyscout player       289/296   98%   already mapped
--     sportmonks player    268/296   91%   already mapped
--     skillcorner player   263/296   89%
--     fifa person          261/296   88%
--     besoccer player      241/296   81%
--     espn person          228/296   77%
--     capology player      148/296   50%
--     uefa player           75/296   25%
--
-- This migration registers the five that are not yet in `data_providers` and
-- that GBM has a reason to hold. `BESOCCER` and `FOTMOB` already exist.
--
-- WHY THESE FIVE
--
--   OPTA      the identity the industry actually keys on. GBM holds no Opta
--             feed and this migration does not imply one — but storing the id
--             now is what makes a licensed feed a configuration change later
--             rather than a re-resolution of 13,000 players.
--   FIFA      governing-body identity, same id family as Opta.
--   UEFA      governing-body identity for European competition.
--   ESPN      a public profile a scout can open without a subscription.
--   CAPOLOGY  salary and contract data. The recruitment engine asks for a
--             salary budget it currently has no way to fill; this is the
--             identity that would let it.
--
-- Priorities sit below the primary sources. None of these carries a fact in
-- GBM yet, so priority is close to theoretical — but the governing bodies are
-- placed just under CLUB and FEDERATION (88) because when they do assert a
-- date of birth or a nationality, they are the better authority.
--
-- WHAT IS DELIBERATELY NOT REGISTERED
--
-- `fm` (141,801 player bridges) is NOT FotMob, and the resolver must not map
-- it. The slug is tempting and the coverage would be the single biggest gain
-- available — 76% of sampled players — which is exactly why it was checked
-- rather than assumed:
--
--   · FotMob player ids are ~6 digits. `fm` ids are 8 digits (64,868 of them)
--     and 10 digits (59,006), with only 4,431 at 6.
--   · Kevin De Bruyne's real FotMob id, 172780, does not appear as an `fm` id.
--   · fotmob.com/players/<anything> returns 200 — it is a single-page app, so
--     a URL probe cannot confirm or deny anything.
--
-- The shape is consistent with Football Manager. Mapping it would have written
-- ~6,000 wrong FotMob ids into `player_external_ids` at confidence 0.99, and
-- every one of them would have looked right. The previous author declined to
-- guess at this slug and was correct to.
--
-- Sofascore does not appear in the register at all — zero rows, any namespace.
-- GBM's 5,684 Sofascore ids came from its own collection and Reep cannot add
-- to them.
-- ============================================================================

insert into data_providers (code, name, kind, default_priority, is_active) values
  ('OPTA',     'Opta (Stats Perform)',      'API',      74, true),
  ('FIFA',     'FIFA',                      'REGISTRY', 86, true),
  ('UEFA',     'UEFA',                      'REGISTRY', 87, true),
  ('ESPN',     'ESPN',                      'SCRAPE',   62, true),
  ('CAPOLOGY', 'Capology (salary data)',    'SCRAPE',   58, true)
on conflict (code) do nothing;

comment on table data_providers is
  'Every source GBM will attribute a fact to. default_priority orders the fact ladder; a provider registered here for identity only still needs a row, because player_external_ids.provider_code is a foreign key.';

-- ----------------------------------------------------------------------------
-- The guard
-- ----------------------------------------------------------------------------
do $$
declare v_bad text;
begin
  select string_agg(code, ', ') into v_bad from (values
    ('OPTA'),('FIFA'),('UEFA'),('ESPN'),('CAPOLOGY')
  ) as w(code)
  where not exists (select 1 from data_providers p where p.code = w.code);
  if v_bad is not null then
    raise exception 'identity providers were not registered: %', v_bad;
  end if;

  -- No new provider may outrank the internal record or a licensed feed.
  select string_agg(code || '=' || default_priority, ', ') into v_bad
    from data_providers
   where code in ('OPTA','FIFA','UEFA','ESPN','CAPOLOGY')
     and default_priority >= (select default_priority from data_providers where code = 'GBM_INTERNAL');
  if v_bad is not null then
    raise exception 'an identity provider outranks GBM_INTERNAL: %', v_bad;
  end if;
end $$;
