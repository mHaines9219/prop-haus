-- ============================================================================
-- Prop Haus — legacy Data API default privileges, made explicit
--
-- Every migration after this one uses a REVOKE-based model: a table is
-- created, and the privileges it should NOT expose are revoked from
-- anon/authenticated ("revoke insert, update, delete on public.orders from
-- authenticated, anon", "revoke select on public.projects ...", and so on).
-- That model assumes the privileges were there to revoke. On the hosted
-- project they are: it was created when Supabase still granted ALL on new
-- public tables, sequences and functions to anon, authenticated and
-- service_role through `alter default privileges for role postgres`.
--
-- A fresh local stack (what CI replays every migration on) no longer does.
-- Since the CLI stopped auto-exposing new tables, postgres-owned tables get
-- only REFERENCES, TRIGGER and TRUNCATE for the API roles, every REVOKE below
-- is a no-op, and even service_role is refused: "permission denied for table
-- profiles" from the auth trigger probe, "permission denied for table
-- organizations" from the org-scoping tests.
--
-- This file is timestamped BEFORE the first table-creating migration so that
-- on a fresh database it runs first and the rest of the chain behaves as it
-- did when it was written. On the hosted project it is additive and idempotent
-- (the same default privileges already exist), so `db push --include-all`
-- applying it out of timestamp order is harmless.
--
-- It deliberately does NOT touch existing objects: no `grant ... on all
-- tables`. That would re-grant what later migrations revoked. Default
-- privileges only apply to objects created after this statement, which on a
-- fresh stack is everything, and on the hosted project is nothing that is not
-- already covered.
--
-- Alternative that was rejected: `[api] auto_expose_new_tables = true` in
-- supabase/config.toml reproduces the same behaviour but is deprecated and is
-- removed from the CLI on 2026-10-30.
-- ============================================================================

alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
