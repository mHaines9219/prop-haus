#!/usr/bin/env node
// Run a Supabase CLI command against the LINKED (hosted) project with the
// database password taken from CATALOG_DATABASE_URL in .env.local.
//
// Why: `supabase migration list|repair` and `supabase db push` prompt for the
// database password and hang when stdin is not a TTY. The CLI reads
// SUPABASE_DB_PASSWORD instead when it is set, so this wrapper sets it from the
// connection string we already keep locally. The password is never printed.
//
//   node --env-file=.env.local scripts/supabase-linked.mjs migration list --linked
//   node --env-file=.env.local scripts/supabase-linked.mjs db push --linked --include-all
//
// Or through package.json: pnpm db:migrations, pnpm db:push
import { spawnSync } from "node:child_process";

const url = process.env.CATALOG_DATABASE_URL;
if (!url) {
  console.error("CATALOG_DATABASE_URL is not set. Run with `node --env-file=.env.local`.");
  process.exit(1);
}
const parsed = new URL(url);
const password = decodeURIComponent(parsed.password);
if (!password) {
  console.error("CATALOG_DATABASE_URL has no password; the CLI needs the postgres role.");
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: supabase-linked.mjs <supabase cli args...>");
  process.exit(1);
}

console.error(`supabase ${args.join(" ")}  (as ${parsed.username}@${parsed.hostname})`);
const result = spawnSync("supabase", args, {
  stdio: "inherit",
  env: { ...process.env, SUPABASE_DB_PASSWORD: password },
});
if (result.error) {
  console.error(result.error.message.includes("ENOENT") ? "supabase CLI not found on PATH (brew install supabase/tap/supabase)" : result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
