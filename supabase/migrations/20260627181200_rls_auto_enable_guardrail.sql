-- The hosted project has an "automatic RLS" guardrail that was created from the
-- dashboard, outside migrations: event trigger `ensure_rls` calling
-- public.rls_auto_enable(), which enables row level security on every table
-- created in `public`. The next migration revokes execute on that function, so
-- a fresh database (local stack, CI) needs it to exist first.
--
-- Timestamped before 20260627181209 on purpose. Guarded so it is a no-op
-- wherever the function already exists, including production.

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    create function public.rls_auto_enable()
    returns event_trigger
    language plpgsql
    as $fn$
    declare
      cmd record;
    begin
      for cmd in
        select * from pg_event_trigger_ddl_commands()
        where command_tag = 'CREATE TABLE' and schema_name = 'public'
      loop
        execute format('alter table %s enable row level security', cmd.object_identity);
      end loop;
    end;
    $fn$;
  end if;

  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls
      on ddl_command_end
      when tag in ('CREATE TABLE')
      execute function public.rls_auto_enable();
  end if;
end
$$;
