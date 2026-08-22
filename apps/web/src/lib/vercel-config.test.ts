import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * vercel.json must satisfy Vercel's schema, and the part that bites is not
 * obvious: the schema sets `additionalProperties: false`. Any key Vercel does
 * not define — including one added purely to explain the file, since JSON has
 * no comments — makes the deployment fail outright, before the build. Six
 * consecutive production deployments failed that way, and nothing in this
 * repository could see it: every local build passed, because a local build
 * never reads vercel.json.
 *
 * So the rule is enforced here instead. The allowlist is deliberately the keys
 * this project actually uses rather than all forty Vercel permits: a stray key
 * is nearly always a mistake, and a deliberate addition should be a visible
 * one-line change to this test.
 *
 * Explanation of *why* the ignore rule is written the way it is belongs in
 * docs/VERCEL_ARCHITECTURE_AUDIT.md — never back inside the JSON.
 */

const ALLOWED_TOP_LEVEL_KEYS = new Set(['$schema', 'ignoreCommand', 'github']);

const CONFIG_PATHS = ['vercel.json', 'apps/web/vercel.json'];

/** Repo root, from this file's location. */
const ROOT = join(__dirname, '..', '..', '..', '..');

function readConfig(relativePath: string): Record<string, unknown> {
  const raw = readFileSync(join(ROOT, relativePath), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('vercel.json', () => {
  for (const path of CONFIG_PATHS) {
    describe(path, () => {
      it('is valid JSON', () => {
        expect(() => readConfig(path)).not.toThrow();
      });

      it('carries no key outside Vercel’s schema', () => {
        const keys = Object.keys(readConfig(path));
        const unknown = keys.filter((k) => !ALLOWED_TOP_LEVEL_KEYS.has(k));
        expect(
          unknown,
          `Vercel's schema sets additionalProperties:false, so these keys fail the ` +
            `deployment before the build: ${unknown.join(', ')}`,
        ).toEqual([]);
      });

      it('still skips only non-main previews, and builds main', () => {
        const cfg = readConfig(path);
        const cmd = String(cfg.ignoreCommand ?? '');
        expect(cmd).toContain('VERCEL_GIT_COMMIT_REF');
        // main must reach a build (exit 1), whatever Vercel calls the env.
        // Sliced rather than matched with a dot-all regex: the `s` flag needs
        // an es2018 target this project does not set.
        const afterMainTest = cmd.slice(cmd.indexOf('VERCEL_GIT_COMMIT_REF'));
        expect(afterMainTest).toContain('exit 1');
      });
    });
  }

  it('both copies stay identical — Root Directory may be either one', () => {
    const [root, app] = CONFIG_PATHS.map(readConfig);
    expect(app).toEqual(root);
  });
});
