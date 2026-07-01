import { defineConfig } from "vitest/config";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
// Resolve react/react-dom from wherever npm actually installed them (may be
// hoisted to monorepo root rather than local node_modules).
const reactDir = path.dirname(require.resolve("react/package.json"));
const reactDomDir = path.dirname(require.resolve("react-dom/package.json"));

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // @tanstack/react-query is hoisted to the monorepo root next to React
    // and, as a dep, resolves `react` through node — bypassing the alias below.
    // Inline it so vitest transforms it and the alias applies.
    server: {
      deps: {
        inline: [/@tanstack\/react-query/],
      },
    },
  },
  resolve: {
    // Pin every react / react-dom import to a single physical copy so there
    // is no dual-instance mismatch between renderer and hooks dispatcher.
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      {
        find: /^react$/,
        replacement: reactDir,
      },
      {
        find: /^react-dom$/,
        replacement: reactDomDir,
      },
      {
        find: /^react\/(.*)$/,
        replacement: reactDir + "/$1",
      },
      {
        find: /^react-dom\/(.*)$/,
        replacement: reactDomDir + "/$1",
      },
    ],
    dedupe: ["react", "react-dom"],
  },
});
