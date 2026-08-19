/**
 * @gbm/providers — the boundary between GBM and every external football
 * data source.
 *
 * Nothing outside this package imports a provider SDK directly. Callers
 * depend on `FootballDataProvider`, which is what lets GBM add, swap or drop
 * a source without touching ingestion or application code.
 */
export * from './types.js';
export * from './http.js';
export { WyscoutProvider, type WyscoutConfig } from './wyscout/index.js';
export { ReepProvider, REEP_PROVIDER_KEYS, type ReepConfig } from './reep/index.js';
export { ApiFootballProvider, type ApiFootballConfig } from './apifootball/index.js';
