import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-plugin-react-hooks 7 ships the React Compiler rules as errors.
    // They flag patterns this codebase uses on purpose (mounted flags,
    // prop-to-state sync, a ref read in render). `next build` fails on
    // errors, so until each site is reworked they stay visible as warnings.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  {
    // Test doubles (vi.mock factories, proxies) are typed loosely by design.
    files: ['**/*.test.{ts,tsx}', 'test/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  globalIgnores(['.next/**', 'out/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts', '.context/**']),
]);
