import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests only. Nothing here touches the network or the database, so
    // the suite runs identically on a laptop and in CI with no credentials.
    include: ['services/**/*.test.ts', 'packages/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: false,
  },
});
