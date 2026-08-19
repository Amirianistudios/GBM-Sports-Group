/**
 * @gbm/database — generated Supabase schema types.
 *
 * `database.types.ts` is generated from the hosted project by
 * `pnpm db:types` and must never be hand-edited. It is committed so that the
 * web app and the ingestion service typecheck without a live database
 * connection (CI has no Supabase credentials).
 */
export type {
  Json,
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes,
} from './database.types.js';

export { Constants } from './database.types.js';
