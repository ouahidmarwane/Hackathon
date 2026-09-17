-- Local diagnostic only: which M11 tables/migrations exist remotely.
begin read only;
select pg_catalog.json_build_object(
  'migrations', (select coalesce(pg_catalog.json_agg(version order by version), '[]'::json) from supabase_migrations.schema_migrations),
  'simulation_tables', (select coalesce(pg_catalog.json_agg(table_name order by table_name), '[]'::json) from information_schema.tables where table_schema = 'public' and table_name like 'simulation_%')
) as diagnostic;
commit;
