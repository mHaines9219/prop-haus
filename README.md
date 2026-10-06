# Prop Haus

Production rental aggregation and workflow platform for the entertainment, event, and creative production industries. Currently LA-focused for MVP.

See `CLAUDE.md` for the full product brief and `TASKS.md` for the active
workstream board (multi-agent task briefs for the current MVP push).

## Stack

- Next.js 15 (App Router) · TypeScript · Tailwind · Zustand · Zod
- Scrapers: cheerio + fetch, cached to `.scrape-cache`
- AI search: two-stage retrieval (OpenAI `text-embedding-3-small` shortlist → OpenRouter LLM rerank) plus multimodal moodboard inputs via Claude Haiku 4.5 / Sonnet 4.6

## Local setup

```bash
pnpm install
cp .env.local.example .env.local   # paste your OPENROUTER_API_KEY
pnpm dev
```

For the catalog and search to work end-to-end you also need to regenerate the data files (gitignored — they're huge):

```bash
# scrape all available vendors (each is independent; see scrapers/*.ts)
pnpm scrape:merge                  # rebuild data/catalog.json from per-vendor files
pnpm enrich --limit 1000           # AI tag style/era/materials/colors/vibes (sample)
pnpm embed                         # build data/embeddings.f32 for vector search
pnpm db:load                       # load catalog + embeddings into Postgres (catalog schema)
```

`db:load` reads `data/catalog.json` + the embeddings and bulk-loads them into the
isolated `catalog` schema via staging + atomic swap (migration
`20260627190000_catalog_inventory`). It connects as the scoped `catalog_writer`
role — set `CATALOG_DATABASE_URL` to that role's connection string (never the
service role):

```bash
CATALOG_DATABASE_URL=postgresql://catalog_writer:<password>@db.<ref>.supabase.co:5432/postgres pnpm db:load
```

## Database migrations

The hosted Supabase project is the only database. Schema changes go through
`supabase/migrations/` and nothing else: no psql against production, no Studio
SQL editor. Merging to main applies them (the `migrate` job in
`.github/workflows/ci.yml` runs `supabase db push` after the checks pass).

```bash
supabase migration new <name>      # always: real, unique timestamp
# edit the new file, then prove it replays from scratch (CI does the same):
supabase start && supabase stop --no-backup
pnpm db:migrations                 # local files vs remote history, side by side
```

`pnpm db:migrations` and `pnpm db:push` wrap the CLI with the database password
from `CATALOG_DATABASE_URL`, because the CLI hangs on its password prompt when
stdin is not a terminal. `pnpm db:push` is for emergencies only; the normal
path is merging.

If the two columns of `pnpm db:migrations` ever disagree, do not work around
it with psql. A local file with no remote row means it was never pushed
(`pnpm db:push` applies it). A remote row with no local file means someone
applied SQL outside this flow: write the file, then
`supabase migration repair --linked --status applied <version>`.

The `migrate` job needs two repository secrets: `SUPABASE_ACCESS_TOKEN` (a
personal access token from supabase.com/dashboard/account/tokens) and
`SUPABASE_DB_PASSWORD` (the postgres password, the one in `CATALOG_DATABASE_URL`).

## AI search modes

The Ask AI bar accepts a text query and/or a moodboard (images + PDFs, drag-drop). Switch between modes in the dropdown to compare cost vs quality:

| Mode | Vision | Rerank | ~Cost / search |
|---|---|---|---|
| `text` | — | gpt-4o-mini | $0.001 |
| `haiku` | Claude Haiku 4.5 | gpt-4o-mini | $0.01–0.03 |
| `sonnet` | Claude Sonnet 4.6 | gpt-4o-mini | $0.05–0.15 |
| `haiku-then-sonnet` | Haiku (extract) | Sonnet (visual rerank) | $0.10–0.30 |

## Repo layout

```
app/               Next.js App Router pages and API routes
components/        React UI
lib/               Domain logic: types, catalog, search, embeddings, moodboard
scrapers/          Per-vendor crawlers + shared helpers
scripts/           Maintenance scripts: enrich, embed, test-search
data/              Generated catalog + embeddings (gitignored)
```

## Vendor coverage

23 LA prop houses configured in `lib/vendors.ts`. 14 are scraped end-to-end (~95k items); the remaining 9 are stubs blocked by login walls, Cloudflare, or phone-only ordering — see TODO comments in `scrapers/{warnerbros,rcvintage,historyforhire,...}.ts`.
