-- ============================================================================
-- URGENT FIX. public.measurement_summary was anon-callable from the moment it
-- was created, in the same file whose header explains why that must not happen.
--
-- WHAT I OBSERVED, one minute after applying 20260802190200
--
--   ANON calling measurement_summary:  200  [{"rows_touched":50,"buffers":790,...
--
-- It returned data to the browser-published anon key. The function is
-- SECURITY DEFINER, so it reads catalog.measurements with elevated rights and
-- hands the result to an unauthenticated caller.
--
-- THE MECHANISM, and it is the exact inverse of a lesson already in this repo
--
-- 20260802190200 did:
--
--   revoke all on function public.measurement_summary(text) from public;
--   grant execute on function public.measurement_summary(text) to service_role;
--
-- `public` there is the PUBLIC pseudo-role, and revoking it removes the default
-- grant every new function gets. That is necessary and it is NOT sufficient on a
-- Supabase database, because Supabase also sets:
--
--   alter default privileges in schema public grant execute on functions
--     to anon, authenticated, service_role;
--
-- So a NEW function in `public` arrives with EXPLICIT grants to anon and
-- authenticated, and revoking from PUBLIC does not touch an explicit role grant.
--
-- 20260802150000's header warns about precisely the opposite half:
--
--   "Revoking only from `anon` and `authenticated` would leave that default grant
--    in place, both roles would inherit it, and the function would stay callable
--    -- a fix that reads as done and changes nothing."
--
-- Both halves are required. I read that note, took the half it emphasised, and
-- missed the half it did not. The complete rule is: revoke from `public` AND from
-- the named roles, every time.
--
-- WHY THE OTHER FUNCTIONS ARE NOT AFFECTED, checked rather than assumed
--
-- catalog/public.backfill_keyword_tsv_chunk used the same one-sided revoke in
-- 20260802170000 and tested clean (anon -> 42501). The difference is that
-- 20260802190000 re-created them with CREATE OR REPLACE, which PRESERVES existing
-- grants -- so the original revoke survived. measurement_summary was brand new, so
-- default privileges applied to it. That is why the same pattern passed once and
-- failed once, and it is the detail that made this easy to get wrong.
--
-- BLAST RADIUS, stated honestly
--
-- What leaked was buffer counts, node types and durations for measurement runs --
-- operational numbers already published in this channel. NOT the raw plan: that
-- was the one thing 190200 deliberately refused to project, and that decision is
-- what kept literal query text out of an anon-readable surface. The barrier that
-- was designed held; the one that was assumed did not.
-- ============================================================================

begin;

-- The half that was missing. Explicit role grants, explicitly removed.
revoke all on function public.measurement_summary(text) from anon, authenticated;

-- Restated so this file is complete on its own rather than relying on 190200.
revoke all on function public.measurement_summary(text) from public;
grant execute on function public.measurement_summary(text) to service_role;

-- ---------------------------------------------------------------------------
-- Bumble's finding, folded in here because the reason has to travel with the
-- object rather than live in a channel thread.
--
-- catalog.measurements is unreachable through the Data API at all -- PostgREST
-- serves only `public` and `graphql_public` (supabase/config.toml:13), so
-- Accept-Profile: catalog returns 406 PGRST106 for every role including
-- service_role. The revokes and the RLS-with-no-policy sit behind a door
-- PostgREST will not route to.
--
-- The hazard the barriers do NOT cover is the house pattern: 20260802012000
-- solved exactly this problem for prop_items with a view in `public`, so the next
-- person needing API access to measurements is one `create view` from following
-- an established idiom. #23 had to opt into safety explicitly with
-- `with (security_invoker = true)`; WITHOUT it a view runs as its owner and
-- bypasses RLS on the underlying table entirely, defeating both barriers at once
-- -- the revokes are on the table, not the view.
--
-- So the prohibition goes in the comment, where someone reading 184000 will find
-- it. And note it is now a *demonstrated* hazard rather than a theoretical one:
-- 190200 got around the schema boundary with a security definer function and
-- shipped anon-callable on the first try.
-- ---------------------------------------------------------------------------
comment on table catalog.measurements is
  'Durable capture of EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) from measurement migrations. Exists because 20260802183000''s counts were emitted as RAISE NOTICE and lost with the process. '
  'NOT readable by anon or authenticated, by four barriers: the catalog schema is not exposed to PostgREST (406 PGRST106), execute/select are revoked, RLS is enabled with no policy, and there is no view. '
  'DO NOT create a view over this table in public. If one is ever unavoidable it MUST be `with (security_invoker = true)` -- a non-invoker view runs as its owner and bypasses this table''s RLS entirely, which defeats the barriers because they are on the table and not on the view. '
  'The plan column can contain literal values from the statement it measured, including user query text; public.measurement_summary() exists to project the derived numbers instead, and it is service_role only.';

commit;
