# Testing

Four layers, each answering a different question. Run the cheapest one that
covers your change; CI runs all of them.

| Layer | Command | Needs | Answers |
| --- | --- | --- | --- |
| Unit | `pnpm test:unit` | nothing | Does the logic and each route handler do the right thing with the database faked? |
| Component | `pnpm test:ui` | nothing | Do client components and forms render, react, and call the right endpoints? |
| Integration | `pnpm test:integration` | a Supabase | Do org scoping and the auth trigger hold against real RLS and real SQL? |
| End to end | `pnpm test:e2e` | a Supabase + the app | Does the built product work, from magic link to placed order? |

`pnpm test` runs unit + component. `pnpm test:coverage` adds the v8 report and
enforces the thresholds in `vitest.config.ts`. `pnpm typecheck` covers test
files too, so an unused import in a test fails the build.

## Layout

- Tests sit next to the code: `lib/orders.ts` → `lib/orders.test.ts`,
  `components/ap/item-card.tsx` → `item-card.test.tsx`. `.test.ts` runs in
  node, `.test.tsx` runs in jsdom.
- `test/helpers/fake-supabase.ts` is an in-memory PostgREST: chainable
  filters, `.single()` cardinality errors, unique violations (23505), counts,
  embeds (`select('*, order_items(*)')`), `!inner` joins with dotted filters,
  RPCs, and storage buckets. Its own contract is pinned in
  `test/helpers/fake-supabase.test.ts`.
- `test/mocks/` holds drop-in module factories for the seams every handler
  crosses: `session.ts` (`signIn()` / `signOut()`), `supabase-admin.ts` (`db`),
  `supabase-server.ts` (`auth`, `userDb`), `next-server.ts` (`after()`
  capture), `next-navigation.ts` and `next-link.ts` (registered globally for
  the ui project by `test/setup-ui.ts`).
- `test/fixtures/` builds valid catalog items, orders, and a ready order
  profile.
- `e2e/` is Playwright. `auth.setup.ts` signs in once through the real login
  page and Mailpit and shares the session via `storageState`; `*.anon.spec.ts`
  run signed out. `seed.sql` is the catalog fixture.

## Writing a route test

```ts
vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());

import { signIn, signOut, ORG_ID } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { jsonRequest, readJson } from '@/test/helpers/request';
import { POST } from './route';

beforeEach(() => {
  db.reset();
  signIn();
  db.relation('orders', 'order_items', 'order_id');
  db.unique('orders', ['org_id', 'idempotency_key']);
});
```

Seed with `db.seed(table, rows)`, break things with
`db.failNext(table, op, error)`, and assert on `db.rows(table)` and `db.log`.
Never call `vi.resetModules()` in a file that uses these shared mocks; the
factory and the test would stop sharing state. `app/api/checkout/route.test.ts`
is the reference.

## Rules that keep the suite honest

- Every mocked test names its seams. A test that mocks the module under test
  proves nothing.
- The fake never proves RLS. Anything that is an access boundary (org
  scoping, the auth trigger) is tested in the integration project against a
  real database. `lib/eval/integration-canary.test.ts` fails the integration
  run rather than letting it skip silently.
- A test that finds a real bug is written for the correct behaviour and marked
  `it.fails` with a one-line comment on what actually happens. The ledger of
  those is the bug list; fixing the bug flips the test to `it`.
- Coverage thresholds are a floor, not a target. Raise them when they are
  comfortably exceeded.

## Local integration and end-to-end

Both need a Supabase. The cheapest is the local stack:

```bash
supabase start
supabase status -o env   # copy API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL into .env.local
psql "$DB_URL" -f e2e/seed.sql
pnpm test:integration
pnpm dev                 # in another shell
pnpm test:e2e            # reuses the dev server
```

`.env.local` is read by the integration project only; unit and component
tests never see credentials. Point the integration tests at a throwaway
project, never production: they create and delete organizations.

The local auth config allows two sign-in emails per hour, which is why the
end-to-end run signs in exactly once.

## CI

`.github/workflows/ci.yml` has two jobs:

- **check**: typecheck, unit + component tests with coverage. Hermetic, no
  secrets, a few minutes.
- **integration**: starts a local Supabase in the runner, applies migrations
  and `e2e/seed.sql`, runs the integration project, builds and starts the app
  against it, and runs Playwright. No secrets either; the local stack's keys
  are well known.

`next build` prerenders the category pages from live facets, so the build
lives in the integration job where a database exists.
