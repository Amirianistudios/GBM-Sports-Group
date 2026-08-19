#!/usr/bin/env tsx
/**
 * Connectivity and capability probe for API-Football.
 *
 *   pnpm apifootball:test
 *
 * Reads API_FOOTBALL_KEY from the environment (or .env.local at the repository
 * root). Costs a handful of requests; /status is free.
 */
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { ApiFootballProvider } from '../packages/providers/src/apifootball/index.js';

const ROOT = resolve(import.meta.dirname, '..');
loadDotenv({ path: resolve(ROOT, '.env.local'), quiet: true });
loadDotenv({ path: resolve(ROOT, '.env'), quiet: true });

async function main(): Promise<void> {
  const api = new ApiFootballProvider();

  console.log('API-Football connectivity check\n');

  if (!api.isConfigured()) {
    console.error(
      'API_FOOTBALL_KEY is not set.\n' +
        'Add it to .env.local at the repository root:\n' +
        '  API_FOOTBALL_KEY=your-key-here\n',
    );
    process.exit(1);
  }

  // 1. Health — plan, quota, and the season restriction that follows from it.
  const health = await api.healthCheck();
  console.log(`  configured     ${health.configured}`);
  console.log(`  reachable      ${health.reachable}`);
  console.log(`  authenticated  ${health.authenticated}`);
  console.log(`  ${health.message}`);
  if (health.permissions) console.log(`  observed limits ${health.permissions.join(', ')}`);
  if (health.latencyMs) console.log(`  latency        ${health.latencyMs}ms`);

  if (!health.authenticated) {
    console.error('\nKey is not authenticating. Stopping before spending quota.');
    process.exit(1);
  }

  // 2. A real read, on a season the plan can actually reach.
  const season = health.permissions?.includes('seasons:2022-2024') ? '2024' : undefined;
  console.log(`\n  sample read: Premier League${season ? ` ${season}` : ''}`);

  const found = await api.searchPlayers({
    name: 'haaland',
    competitionExternalId: '39',
    seasonExternalId: season,
  });

  if (!found.length) {
    console.log('  no players returned — check the season is within your plan.');
    return;
  }

  const player = found[0];
  console.log(`  -> ${player.fullName}  dob=${player.dateOfBirth ?? '?'}  id=${player.externalId}`);

  const stats = await api.getPlayerSeasonStats(player.externalId, {
    competitionExternalId: '39',
    seasonExternalId: season,
  });

  for (const s of stats.slice(0, 3)) {
    console.log(
      `     apps=${s.matchesPlayed ?? '-'} mins=${s.minutesPlayed ?? '-'} ` +
        `goals=${s.goals ?? '-'} assists=${s.assists ?? '-'} ` +
        `duels=${s.duelsWon ?? '-'}/${s.duels ?? '-'} rating=${(s.advanced?.rating as number)?.toFixed?.(2) ?? '-'}`,
    );
  }

  console.log('\nConnection verified.');
}

main().catch((err: unknown) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
