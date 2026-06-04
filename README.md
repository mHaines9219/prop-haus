# Prop Haus

Production rental aggregation and workflow platform for the entertainment, event, and creative production industries. Currently LA-focused for MVP.

See `CLAUDE.md` for the full product brief.

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
```

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
