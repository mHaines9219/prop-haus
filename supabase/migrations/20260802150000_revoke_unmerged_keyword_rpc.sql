-- ---------------------------------------------------------------------------
-- Withdraw anon/authenticated execute on public.search_catalog_keyword.
--
-- WHY
--
-- That function was applied to the live project from an UNMERGED branch (#31,
-- marked WIP because the query does not work), and its migration grants execute
-- to `anon`. The anon key is not a secret — it ships to every browser — so the
-- function is reachable by anyone on the internet at
-- POST /rest/v1/rpc/search_catalog_keyword.
--
-- Verified against the live project with the anon key alone:
--
--   catalog_facets            200   277ms   ok            <- control, intended
--   search_catalog_keyword    200   378ms   q=couch
--   search_catalog_keyword    500  3121ms   q=brass  57014 statement timeout
--   search_catalog_keyword    500  3068ms   q=lamp   57014 statement timeout
--
-- So an unauthenticated caller can spend a full statement timeout of database
-- time per request on a function no application code calls. `count(*) over ()`
-- materializes every match before LIMIT and `ts_rank` recomputes the
-- twelve-field tsvector per matching row, so cost scales with match count and
-- `max_results` does not bound it.
--
-- This is resource consumption, not disclosure: the rows it would return are
-- catalog reference data that `public.catalog_items` already serves to anon by
-- design. Worth closing before a public deploy rather than after.
--
-- WHY A GUARD RATHER THAN A PLAIN REVOKE
--
-- The function exists in the live database but in no merged migration, so a
-- bare `revoke` would fail on a fresh database where it was never created.
-- The `if exists` check makes this correct in both states and idempotent.
--
-- WHY IT REVOKES FROM `public` AND NOT ONLY FROM anon/authenticated
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default. Revoking only
-- from `anon` and `authenticated` would leave that default grant in place, both
-- roles would inherit it, and the function would stay callable — a fix that
-- reads as done and changes nothing.
--
-- This repo already knows that: `20260627181123_init_accounts.sql:131` revokes
-- `private.current_user_org_ids()` from `public`, and line 181 revokes
-- `handle_new_user()` from `public, anon, authenticated`. Same shape here.
--
-- `service_role` keeps access, because #31's migration granted it explicitly and
-- an explicit role grant survives a revoke from PUBLIC.
--
-- WHEN TO UNDO
--
-- Re-grant in the same change that lands the stored-tsvector redesign, once the
-- query is fast enough that an anonymous call is cheap. Until then the app does
-- not call this and nobody else should be able to either.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'search_catalog_keyword'
  ) then
    revoke execute on function public.search_catalog_keyword(text, int)
      from public, anon, authenticated;

    comment on function public.search_catalog_keyword(text, int) is
      'NOT CALLABLE by anon/authenticated: execute revoked because the query '
      'exceeds the statement timeout on ordinary single-word queries, and this '
      'function is reachable with the browser-published anon key. Applied from '
      'unmerged PR #31. Re-grant with the stored-tsvector redesign.';

    raise notice 'revoked execute on public.search_catalog_keyword from anon, authenticated';
  else
    raise notice 'public.search_catalog_keyword does not exist here; nothing to revoke';
  end if;
end
$$;
