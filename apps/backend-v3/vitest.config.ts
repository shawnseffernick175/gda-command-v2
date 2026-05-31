import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: [
      'tests/integration/endpoints.test.ts',
      'tests/integration/workers.test.ts',
      'tests/integration/audit-schema.test.ts',
      'tests/integration/setup.ts',
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
