-- The "automatic RLS" guardrail (event trigger `ensure_rls` -> public.rls_auto_enable())
-- is good to keep — it auto-enables RLS on any newly created table. But the function
-- lives in the `public` schema where PUBLIC has EXECUTE by default, exposing it as an
-- RPC endpoint (flagged by the security advisor). The event trigger invokes it
-- regardless of EXECUTE grants, so revoking direct execute is safe.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
