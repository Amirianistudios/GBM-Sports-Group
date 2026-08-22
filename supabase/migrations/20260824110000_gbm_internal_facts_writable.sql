-- ============================================================================
-- GBM INTELLIGENCE — 0022 GBM MAY RECORD ITS OWN FACTS
-- ----------------------------------------------------------------------------
-- Found by testing Add Player end to end: a player saved, but the market value
-- and contract expiry typed alongside him did not. market_values and contracts
-- were readable by members and writable only by the service role, because
-- until now every row in them came from an import. Both inserts were rejected
-- by RLS and the action ignored the result, so the loss was silent — the worst
-- possible outcome, and the reason the action now checks every write.
--
-- An agent recording a client's contract or a negotiated valuation is core
-- agency work, so the grant is real but narrow: portfolio managers may write,
-- and only rows attributed to GBM itself (provider_code 'GBM_INTERNAL').
-- Nobody can edit or forge a provider's assertion through the application;
-- those rows still belong to the importer alone, which keeps "who claimed
-- this" answerable for every fact on the platform.
-- ============================================================================
insert into data_providers (code, name, kind, is_active)
values ('GBM_INTERNAL', 'GBM Sports Group (internal)', 'INTERNAL', true)
on conflict (code) do nothing;

drop policy if exists market_values_gbm_internal_write on market_values;
create policy market_values_gbm_internal_write on market_values
  for all to authenticated
  using (gbm_can_manage_portfolio() and provider_code = 'GBM_INTERNAL')
  with check (gbm_can_manage_portfolio() and provider_code = 'GBM_INTERNAL');

drop policy if exists contracts_gbm_internal_write on contracts;
create policy contracts_gbm_internal_write on contracts
  for all to authenticated
  using (gbm_can_manage_portfolio() and provider_code = 'GBM_INTERNAL')
  with check (gbm_can_manage_portfolio() and provider_code = 'GBM_INTERNAL');

comment on policy market_values_gbm_internal_write on market_values is
  'Portfolio managers may record GBM''s own valuations. Provider-asserted rows remain writable only by the importer.';
comment on policy contracts_gbm_internal_write on contracts is
  'Portfolio managers may record contracts GBM knows. Provider-asserted rows remain writable only by the importer.';
