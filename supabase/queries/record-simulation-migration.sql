-- Record the already-applied M11 simulation migration in the local ledger.
-- Minimal repair so a future `supabase db push` skips it.
begin;
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20260917000400', 'simulation', '{}')
on conflict (version) do nothing;
commit;
