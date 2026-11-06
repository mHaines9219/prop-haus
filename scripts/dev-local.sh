#!/usr/bin/env bash
# `pnpm dev:local`: the dev server against the LOCAL Supabase stack on port
# 3000, never the hosted project (the shell's values win over .env.local).
# Every provider is pinned to its mock, so nothing leaves the machine. It
# takes the same port as `pnpm dev`, so stop that first. It builds into
# .next-local so the two never share a build directory.
#
# Needs `supabase start` and, for a schema change not yet in the stack,
# `supabase migration up --local`. Sign in through Mailpit
# (http://127.0.0.1:54324).
#
#   pnpm dev:local
#   ADMIN_EMAILS=me@example.com pnpm dev:local   # make a test address an admin (sandbox switch, view-as)
set -euo pipefail
cd "$(dirname "$0")/.."

eval "$(supabase status -o env 2>/dev/null)"
[ -n "${API_URL:-}" ] || { echo "No local Supabase stack. Run: supabase start" >&2; exit 1; }
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 3000 is in use. Stop the other dev server first." >&2
  exit 1
fi

export NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-$ANON_KEY}" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-$SECRET_KEY}" \
  SUPABASE_SECRET_KEY="${SECRET_KEY:-$SERVICE_ROLE_KEY}" \
  MAIL_PROVIDER=log FORMS_PROVIDER=mock INTAKE_PROVIDER=mock SPACELAB_MODEL_PROVIDER=mock \
  OPENROUTER_API_KEY= \
  NEXT_DIST_DIR=.next-local \
  PORT=3000

cat <<'NOTE'

  LOCAL STACK on http://localhost:3000 (not the hosted project).
  Sign in with the EMAIL LINK, then open it in Mailpit: http://127.0.0.1:54324
  "Continue with Google" does not work here: the local auth service has no
  Google client, so Google never calls back. Use `pnpm dev` for Google sign-in.

NOTE

if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env)"
  exec fnm exec --using "$(cat .nvmrc)" -- pnpm dev
fi
exec pnpm dev
