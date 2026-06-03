import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const requireSourceUrl = require("./eslint-rules/require-source-url.cjs");
const fontFloor = require("./eslint-rules/font-floor.cjs");

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "gda-rules": {
        rules: {
          "require-source-url": requireSourceUrl,
          "font-floor": fontFloor,
        },
      },
    },
    rules: {
      "gda-rules/require-source-url": "error",
      "gda-rules/font-floor": "error",
    },
  },
]);

export default eslintConfig;
