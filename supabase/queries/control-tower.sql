-- Fixed server-side read. Never interpolate route, search or user input here.
begin read only;
select pg_catalog.json_build_object(
  'jobs', (select coalesce(pg_catalog.json_agg(j order by j.id), '[]'::json) from
    (select id, source, external_id, provenance, producer from public.jobs) j),
  'claims', (select coalesce(pg_catalog.json_agg(c order by c.id), '[]'::json) from
    (select id, job_id, source, source_record_ref, property, value, provenance, producer,
      recorded_at, effective_from from public.job_claims) c),
  'events', (select coalesce(pg_catalog.json_agg(e order by e.id), '[]'::json) from
    (select id, job_id, source, external_id, event_type, provenance, producer,
      time_kind, occurred_at_raw, occurred_at from public.events) e)
) as snapshot;
commit;
