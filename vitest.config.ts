import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

/** KEY=VALUE lines from .env.local, for the integration project only. */
function localEnv(): Record<string, string> {
  const file = path.join(root, '.env.local');
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/**
 * Three projects, three trust levels:
 *
 *   unit         node, hermetic. lib/ and route handlers with the database mocked
 *                (test/helpers/fake-supabase.ts). Runs everywhere, no env.
 *   ui           jsdom + Testing Library. Client components, forms, hooks.
 *   integration  node against a REAL Supabase (local stack in CI, .env.local
 *                here). Org-scoping and auth-trigger tests live here because a
 *                mock of RLS would agree with a broken one.
 *
 * `pnpm test` runs the first two. `pnpm test:integration` runs the third and
 * fails loudly without credentials (lib/eval/integration-canary.test.ts).
 * Playwright end-to-end lives in e2e/ and is excluded from Vitest entirely.
 */

const INTEGRATION = [
  'lib/projects.test.ts',
  'lib/auth-probe.test.ts',
  'lib/eval/integration-canary.test.ts',
];

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': root } },
  test: {
    exclude: ['**/node_modules/**', '**/.next/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reportOnFailure: true,
      reporter: ['text-summary', 'lcov', 'json-summary'],
      include: [
        'lib/**/*.ts',
        'app/**/*.{ts,tsx}',
        'components/**/*.tsx',
        'hooks/**/*.ts',
        'middleware.ts',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/__fixtures__/**',
        'lib/spacelab/**',
        'lib/eval/**',
        'lib/supabase/**',
        'lib/auth-probe.ts',
        'app/layout.tsx',
        'app/providers.tsx',
        'app/**/loading.tsx',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'test/**/*.test.ts', 'middleware.test.ts', 'scripts/**/*.test.ts'],
          exclude: ['**/node_modules/**', ...INTEGRATION],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['**/*.test.tsx'],
          exclude: ['**/node_modules/**', '**/.next/**', 'e2e/**'],
          setupFiles: ['test/setup-ui.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: INTEGRATION,
          // Real credentials come from .env.local here and from the local
          // Supabase stack in CI. Unit and ui projects never see them.
          env: localEnv(),
        },
      },
    ],
  },
});
