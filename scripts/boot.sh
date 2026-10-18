#!/usr/bin/env bash
# Prop Haus startup. One command that leaves this checkout in the state CI
# expects, then starts the dev server.
#
#   pnpm boot             toolchain, Supabase link, migration drift, the CI
#                         gate (typecheck, lint, unit + component tests), then
#                         `next dev`
#   pnpm preflight        the same without the server (= boot --check)
#   pnpm ci:local         --check plus the CI integration job on a local
#                         Supabase stack: replay every migration from scratch,
#                         seed, integration tests, build, Playwright. Needs
#                         Docker. (= boot --full)
#   pnpm boot --status    toolchain, link and drift only; a few seconds. This
#                         is what the Claude Code session hook runs.
#   pnpm boot --push      also apply the local migrations production lacks
#                         (pnpm db:push) before the gate. Normally merging to
#                         main does this through the CI migrate job.
#
# Nothing here touches production unless you pass --push.
#
# MAINTENANCE: this script mirrors .github/workflows/ci.yml. When a CI step,
# package script, required env var, Node version, project ref, port, seed
# file or stack exclude list changes, change it here in the same PR
# (CLAUDE.md, "Active Workstreams").
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJECT_REF="${SUPABASE_PROJECT_REF:-euhyuodaylryedwnvwdd}"
NODE_WANTED="$(tr -d '[:space:]' < .nvmrc)"
MODE=boot
PUSH=0
for arg in "$@"; do
  case "$arg" in
    --check) MODE=check ;;
    --status) MODE=status ;;
    --full) MODE=full ;;
    --push) PUSH=1 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg (see --help)" >&2; exit 2 ;;
  esac
done

if [ -t 1 ]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'; else B=; G=; Y=; R=; N=; fi
step() { printf '\n%s== %s%s\n' "$B" "$*" "$N"; }
ok()   { printf '%s  ok%s  %s\n' "$G" "$N" "$*"; }
warn() { printf '%s  !!%s  %s\n' "$Y" "$N" "$*"; }
fail() { printf '%s  XX%s  %s\n' "$R" "$N" "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------------------
# Toolchain. CI runs Node 22 and the jsdom tests fail wholesale on 25, so the
# script re-executes itself under fnm when the shell's node is wrong.
# ---------------------------------------------------------------------------
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" != "$NODE_WANTED" ] && [ -z "${PROP_HAUS_BOOT_REEXEC:-}" ] && have fnm; then
  export PROP_HAUS_BOOT_REEXEC=1
  exec fnm exec --using "$NODE_WANTED" bash "$0" "$@"
fi
step "Toolchain"
if [ "$(node_major)" != "$NODE_WANTED" ]; then
  fail "Node $NODE_WANTED is required (found $(node -v 2>/dev/null || echo none)). brew install fnm && fnm install $NODE_WANTED, then rerun."
fi
ok "node $(node -v)"
have pnpm || fail "pnpm not found (corepack enable, or brew install pnpm)"
ok "pnpm $(pnpm -v)"
have supabase || fail "supabase CLI not found (brew install supabase/tap/supabase)"
ok "supabase CLI $(supabase --version 2>/dev/null | head -1)"

if [ "$MODE" != status ]; then
  pnpm install --frozen-lockfile --reporter=silent
  ok "dependencies match pnpm-lock.yaml"
fi

# ---------------------------------------------------------------------------
# Environment. The wrapper scripts take the database password from
# CATALOG_DATABASE_URL; without it nothing about the hosted project can be
# checked, so say so and move on rather than hang on a password prompt.
# ---------------------------------------------------------------------------
step "Environment"
if [ ! -f .env.local ]; then
  cp .env.local.example .env.local
  warn ".env.local did not exist; copied from .env.local.example. Fill in the Supabase keys and CATALOG_DATABASE_URL."
fi
HAVE_DB_URL=0
if grep -qE '^\s*(export\s+)?CATALOG_DATABASE_URL=.+' .env.local; then
  HAVE_DB_URL=1
  ok "CATALOG_DATABASE_URL is set"
else
  warn "CATALOG_DATABASE_URL is not in .env.local; skipping the link and migration checks"
fi

# ---------------------------------------------------------------------------
# Link. supabase/.temp is gitignored, so every clone and every worktree starts
# unlinked and `pnpm db:migrations` would prompt. Link non-interactively.
# ---------------------------------------------------------------------------
linked() { [ -f supabase/.temp/project-ref ] && [ "$(cat supabase/.temp/project-ref)" = "$PROJECT_REF" ]; }
if [ "$HAVE_DB_URL" = 1 ]; then
  step "Supabase link ($PROJECT_REF)"
  if linked; then
    ok "already linked"
  else
    node --env-file=.env.local scripts/supabase-linked.mjs link --project-ref "$PROJECT_REF" >/dev/null 2>&1 \
      || fail "supabase link failed. Run 'supabase login' once, then rerun."
    ok "linked (wrote supabase/.temp)"
  fi

  # -------------------------------------------------------------------------
  # Drift. Same two greps as the CI migrate job: a local file with no remote
  # row was never applied (CI applies it on merge to main); a remote row with
  # no local file means SQL ran outside this flow.
  # -------------------------------------------------------------------------
  step "Migrations: local files vs production history"
  list_migrations() { node --env-file=.env.local scripts/supabase-linked.mjs migration list --linked 2>/dev/null; }
  LIST="$(list_migrations)" || fail "could not read the remote migration history (network? password in CATALOG_DATABASE_URL?)"
  LOCAL_ONLY="$(printf '%s\n' "$LIST" | grep -E '^\s*[0-9]{14}\s*\|\s*\|' | awk '{print $1}' || true)"
  REMOTE_ONLY="$(printf '%s\n' "$LIST" | grep -E '^\s*\|\s*[0-9]{14}' | awk '{print $2}' || true)"
  if [ -n "$REMOTE_ONLY" ]; then
    warn "production has migrations this checkout lacks: $(echo $REMOTE_ONLY)"
    warn "pull main; if they are still missing, write the file and run: supabase migration repair --linked --status applied <version>"
  fi
  if [ -n "$LOCAL_ONLY" ] && [ "$PUSH" = 1 ]; then
    warn "applying to production: $(echo $LOCAL_ONLY)"
    node --env-file=.env.local scripts/supabase-linked.mjs db push --linked --include-all --yes
    LIST="$(list_migrations)"
    LOCAL_ONLY="$(printf '%s\n' "$LIST" | grep -E '^\s*[0-9]{14}\s*\|\s*\|' | awk '{print $1}' || true)"
  fi
  if [ -n "$LOCAL_ONLY" ]; then
    warn "not yet applied to production: $(echo $LOCAL_ONLY)"
    warn "merging to main applies them (CI migrate job); 'pnpm boot --push' applies them now"
  fi
  if [ -z "$LOCAL_ONLY" ] && [ -z "$REMOTE_ONLY" ]; then
    ok "$(printf '%s\n' "$LIST" | grep -cE '^\s*[0-9]{14}\s*\|\s*[0-9]{14}') migrations, local and production agree"
  fi
fi

[ "$MODE" = status ] && exit 0

# ---------------------------------------------------------------------------
# The CI `check` job, plus lint because `next build` runs ESLint and fails on
# errors (the integration job's build step).
# ---------------------------------------------------------------------------
step "CI gate: what .github/workflows/ci.yml runs without a database"
dups="$(ls supabase/migrations/*.sql | xargs -n1 basename | cut -d_ -f1 | sort | uniq -d)"
[ -z "$dups" ] || fail "duplicate migration versions: $dups"
ok "migration versions are unique"
pnpm -s typecheck
ok "typecheck"
pnpm -s exec next lint --quiet
ok "lint (errors only; warnings are listed by 'pnpm lint')"
pnpm -s test:coverage --reporter=dot 2>&1 | grep -vE '^\s*$'
ok "unit + component tests with coverage thresholds"

# ---------------------------------------------------------------------------
# --full: the CI `integration` job, step for step, on a local stack.
# ---------------------------------------------------------------------------
if [ "$MODE" = full ]; then
  step "CI integration job on a local Supabase stack"
  have docker || fail "Docker is required for the local stack (install Docker Desktop)"
  if ! docker info >/dev/null 2>&1; then
    if [ "$(uname)" = Darwin ] && [ -d /Applications/Docker.app ]; then
      open -a Docker
      printf '  starting Docker Desktop'
      for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; printf '.'; sleep 2; done
      echo
    fi
    docker info >/dev/null 2>&1 || fail "Docker daemon is not running"
  fi
  ok "docker"
  have psql || fail "psql is required to load e2e/seed.sql (brew install libpq && brew link --force libpq)"

  EXCLUDE=studio,imgproxy,edge-runtime,analytics,vector,realtime
  STARTED_STACK=0
  if supabase status >/dev/null 2>&1; then
    warn "a local stack is already running; resetting it so every migration replays from scratch, as CI does"
    supabase db reset >/dev/null
  else
    supabase start -x "$EXCLUDE" >/dev/null
    STARTED_STACK=1
  fi
  stop_stack() { if [ "$STARTED_STACK" = 1 ]; then supabase stop --no-backup >/dev/null 2>&1 || true; fi; }
  trap stop_stack EXIT
  ok "migrations replayed on a fresh local stack"

  # The shell wins over .env.local in next build/start and (since the vitest
  # change that shipped with this script) in the integration project, so the
  # hosted keys in .env.local are never used from here on.
  eval "$(supabase status -o env 2>/dev/null)"
  export NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-$ANON_KEY}" \
    NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
    SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-$SECRET_KEY}" \
    SUPABASE_SECRET_KEY="${SECRET_KEY:-$SERVICE_ROLE_KEY}" \
    SUPABASE_DB_URL="$DB_URL" \
    MAILPIT_URL="${MAILPIT_URL:-${INBUCKET_URL:-http://127.0.0.1:54324}}" \
    MAIL_PROVIDER=log FORMS_PROVIDER=mock INTAKE_PROVIDER=mock SPACELAB_MODEL_PROVIDER=mock \
    OPENROUTER_API_KEY= CI=true

  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f e2e/seed.sql
  ok "seeded e2e/seed.sql"
  pnpm -s test:integration --reporter=dot 2>&1 | grep -vE '^\s*$'
  ok "integration tests"

  PORT="${PORT:-3000}"
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    warn "port $PORT is in use (a dev server?); running the built app on 3100"
    PORT=3100
  fi
  export PORT
  pnpm -s build >/dev/null
  ok "next build"
  pnpm -s exec playwright install chromium >/dev/null 2>&1 || true
  pnpm -s test:e2e
  ok "end-to-end tests"
fi

if [ "$MODE" != boot ]; then
  step "Done"
  ok "this checkout would pass CI${LOCAL_ONLY:+ (production still lacks: $(echo $LOCAL_ONLY))}"
  exit 0
fi

step "Starting next dev"
exec pnpm dev
