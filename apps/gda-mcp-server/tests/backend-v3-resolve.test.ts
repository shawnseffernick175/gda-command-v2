/**
 * F-507: Verify that all @gda/backend-v3 module paths used in services.ts
 * actually resolve at runtime. Catches missing-package errors before prod.
 */
import { describe, it, expect } from 'vitest';

const BACKEND_V3_MODULES = [
  '@gda/backend-v3/dist/services/opportunities/merge.js',
  '@gda/backend-v3/dist/services/doctrine/evaluate.js',
  '@gda/backend-v3/dist/services/pwin/index.js',
  '@gda/backend-v3/dist/services/rag/index.js',
  '@gda/backend-v3/dist/services/action-items/index.js',
  '@gda/backend-v3/dist/services/drafts/index.js',
  '@gda/backend-v3/dist/services/pipeline/index.js',
  '@gda/backend-v3/dist/services/color-teams/index.js',
  '@gda/backend-v3/dist/services/launchpad/summary.js',
  '@gda/backend-v3/dist/services/memory/index.js',
];

describe('@gda/backend-v3 runtime resolution', () => {
  for (const specifier of BACKEND_V3_MODULES) {
    it(`resolves ${specifier}`, async () => {
      const mod = await import(specifier);
      expect(mod).toBeDefined();
      expect(typeof mod).toBe('object');
    });
  }
});
