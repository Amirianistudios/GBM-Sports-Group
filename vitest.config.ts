import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests only. Nothing here touches the network or the database, so
    // the suite runs identically on a laptop and in CI with no credentials.
    include: [
      'services/**/*.test.ts',
      'packages/**/*.test.ts',
      'scripts/**/*.test.ts',
      // Dependency-free web-app units (env validation, auth-flow policy).
      // Anything importing Next.js itself stays out of this node-env suite.
      'apps/web/src/**/*.test.ts',
    ],
    environment: 'node',
    passWithNoTests: false,
  },
});
