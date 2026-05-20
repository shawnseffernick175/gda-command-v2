import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**", "src/db/migrations/__tests__/**"],
  },
});
