import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/db/migrations/__tests__/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    testTimeout: 30000,
  },
});
