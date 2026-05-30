import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const requireSourceUrl = require('./eslint-rules/require-source-url.cjs');

export default tseslint.config(
  { ignores: ['dist', 'storybook-static', 'node_modules', 'src/lib/tokens.ts', 'src/styles/tokens.css'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'gda-rules': { rules: { 'require-source-url': requireSourceUrl } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'gda-rules/require-source-url': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
