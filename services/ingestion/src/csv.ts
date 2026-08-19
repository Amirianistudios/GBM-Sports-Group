/**
 * Streaming CSV reader.
 *
 * The Transfermarkt tables run to millions of rows; `appearances.csv` alone is
 * ~1.8M. Reading them into memory as a string is not an option, so everything
 * here is an async iterator over a gunzip stream.
 */
import { createReadStream, existsSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { parse } from 'csv-parse';
import { resolve } from 'node:path';

export type Row = Record<string, string>;

/**
 * Resolves `<dir>/<name>.csv.gz`, falling back to an already-extracted
 * `<dir>/<name>.csv`. Both shapes occur: the R2 bucket serves gzip, while a
 * manually unzipped archive leaves plain CSV.
 */
export function findTable(dir: string, name: string): { path: string; gzipped: boolean } | null {
  const gz = resolve(dir, `${name}.csv.gz`);
  if (existsSync(gz)) return { path: gz, gzipped: true };
  const plain = resolve(dir, `${name}.csv`);
  if (existsSync(plain)) return { path: plain, gzipped: false };
  return null;
}

/** Yields one object per CSV row, with header keys. */
export async function* readRows(file: { path: string; gzipped: boolean }): AsyncGenerator<Row> {
  const parser = parse({
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true,
  });

  const source = file.gzipped
    ? createReadStream(file.path).pipe(createGunzip())
    : createReadStream(file.path);

  source.pipe(parser);
  for await (const record of parser) yield record as Row;
}

/** Collects rows matching a predicate. Use only for tables known to be small. */
export async function collect(
  file: { path: string; gzipped: boolean },
  keep: (row: Row) => boolean = () => true,
): Promise<Row[]> {
  const out: Row[] = [];
  for await (const row of readRows(file)) if (keep(row)) out.push(row);
  return out;
}

// ---------------------------------------------------------------------------
// Field coercion
//
// Transfermarkt exports use empty strings, 'NA' and literal 'null' for missing
// values interchangeably. Coercing centrally keeps that mess out of the
// importer, and keeps NULL meaning "the source did not say".
// ---------------------------------------------------------------------------

const BLANK = new Set(['', 'na', 'n/a', 'null', 'none', 'nan', '-']);

export function str(v: string | undefined): string | null {
  if (v === undefined) return null;
  const s = v.trim();
  return BLANK.has(s.toLowerCase()) ? null : s;
}

export function int(v: string | undefined): number | null {
  const s = str(v);
  if (s === null) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

export function num(v: string | undefined): number | null {
  const s = str(v);
  if (s === null) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** ISO date (YYYY-MM-DD) or null. Rejects the year-zero placeholders TM emits. */
export function date(v: string | undefined): string | null {
  const s = str(v);
  if (s === null) return null;
  const iso = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  if (iso.startsWith('0000') || iso.startsWith('1900-01-01')) return null;
  return iso;
}
