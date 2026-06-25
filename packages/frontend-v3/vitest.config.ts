import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // @tanstack/react-query is hoisted to the monorepo root next to React 18
    // and, as a dep, resolves `react` through node — bypassing the alias below
    // and binding the wrong React (null hook dispatcher under React 19's
    // renderer). Inline it so vitest transforms it and the alias applies.
    server: {
      deps: {
        inline: [/@tanstack\/react-query/],
      },
    },
  },
  resolve: {
    // The monorepo root hoists React 18 while this package uses its own nested
    // React 19. With two physical versions present, `dedupe` can't merge them,
    // so root-hoisted deps (react-query) bind React 18 while the tree under
    // test renders with React 19. Pin every react / react-dom import to this
    // package's React 19 so there is a single shared instance.
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      {
        find: /^react$/,
        replacement: path.resolve(__dirname, "node_modules/react"),
      },
      {
        find: /^react-dom$/,
        replacement: path.resolve(__dirname, "node_modules/react-dom"),
      },
      {
        find: /^react\/(.*)$/,
        replacement: path.resolve(__dirname, "node_modules/react") + "/$1",
      },
      {
        find: /^react-dom\/(.*)$/,
        replacement: path.resolve(__dirname, "node_modules/react-dom") + "/$1",
      },
    ],
    dedupe: ["react", "react-dom"],
  },
});
