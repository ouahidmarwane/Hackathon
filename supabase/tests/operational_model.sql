-- LOCAL ONLY: standalone PostgreSQL regression, no pgTAP dependency.
-- Run in a disposable local database with Supabase roles, as an administrator
-- with BYPASSRLS / superuser rights and permission to SET ROLE for test roles.
-- Use psql -X -v ON_ERROR_STOP=1 -f <this-file>; every change rolls back.
begin;

-- Valid fixture-shaped source data: exact C02 job fields and event clock times.
insert into public.jobs (id, source, external_id, provenance, producer)
values (gen_random_uuid(), 'c02-supplied', 'W-1', 'SUPPLIED', 'fixture-loader');
insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
select gen_random_uuid(), id, 'c02-supplied', 'W-1', 'stage', 'awaiting parts', 'SUPPLIED', 'fixture-loader'
from public.jobs where source = 'c02-supplied' and external_id = 'W-1';
insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
select gen_random_uuid(), id, 'c02-supplied', 'W-1', 'part_receipt', 'received', 'SUPPLIED', 'fixture-loader'
from public.jobs where source = 'c02-supplied' and external_id = 'W-1';
insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
select gen_random_uuid(), id, 'c02-supplied', 'W-1', 'receipt_ref', 'R-1', 'SUPPLIED', 'fixture-loader'
from public.jobs where source = 'c02-supplied' and external_id = 'W-1';
insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
select gen_random_uuid(), id, 'c02-supplied', 'W-1', 'next_owner', 'parts coordinator', 'SUPPLIED', 'fixture-loader'
from public.jobs where source = 'c02-supplied' and external_id = 'W-1';
insert into public.jobs (id, source, external_id, provenance, producer)
values (gen_random_uuid(), 'c02-supplied', 'W-2', 'SUPPLIED', 'fixture-loader');
insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
select gen_random_uuid(), id, 'c02-supplied', 'W-2', 'stage', 'repair paused', 'SUPPLIED', 'fixture-loader'
from public.jobs where source = 'c02-supplied' and external_id = 'W-2';
insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
select gen_random_uuid(), id, 'c02-supplied', 'W-2', 'part', 'not required', 'SUPPLIED', 'fixture-loader'
from public.jobs where source = 'c02-supplied' and external_id = 'W-2';
insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
select gen_random_uuid(), id, 'c02-supplied', 'W-2', 'customer_approval', 'missing', 'SUPPLIED', 'fixture-loader'
from public.jobs where source = 'c02-supplied' and external_id = 'W-2';
insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
select gen_random_uuid(), id, 'c02-supplied', 'W-2', 'next_owner', 'service adviser', 'SUPPLIED', 'fixture-loader'
from public.jobs where source = 'c02-supplied' and external_id = 'W-2';
insert into public.jobs (id, source, external_id, provenance, producer)
values (gen_random_uuid(), 'c02-supplied', 'W-3', 'SUPPLIED', 'fixture-loader');
insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
select gen_random_uuid(), id, 'c02-supplied', 'W-3', 'stage', 'quality check', 'SUPPLIED', 'fixture-loader'
from public.jobs where source = 'c02-supplied' and external_id = 'W-3';
insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
select gen_random_uuid(), id, 'c02-supplied', 'W-3', 'device_state', 'offline', 'SUPPLIED', 'fixture-loader'
from public.jobs where source = 'c02-supplied' and external_id = 'W-3';
insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
select gen_random_uuid(), id, 'c02-supplied', 'W-3', 'next_owner', 'workshop controller', 'SUPPLIED', 'fixture-loader'
from public.jobs where source = 'c02-supplied' and external_id = 'W-3';
insert into public.jobs (id, source, external_id, provenance, producer)
values (gen_random_uuid(), 'c02-supplied', 'W-4', 'SUPPLIED', 'fixture-loader');
insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
select gen_random_uuid(), id, 'c02-supplied', 'W-4', 'stage', 'ready', 'SUPPLIED', 'fixture-loader'
from public.jobs where source = 'c02-supplied' and external_id = 'W-4';
insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
select gen_random_uuid(), id, 'c02-supplied', 'W-4', 'customer_approval', 'received', 'SUPPLIED', 'fixture-loader'
from public.jobs where source = 'c02-supplied' and external_id = 'W-4';
insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
select gen_random_uuid(), id, 'c02-supplied', 'W-4', 'next_owner', 'collection desk', 'SUPPLIED', 'fixture-loader'
from public.jobs where source = 'c02-supplied' and external_id = 'W-4';
insert into public.events (id, job_id, source, external_id, event_type, provenance, producer, time_kind, occurred_at_raw)
select gen_random_uuid(), id, 'c02-supplied', 'R-1', 'part scan', 'SUPPLIED', 'fixture-loader', 'clock', '08:40'
from public.jobs where source = 'c02-supplied' and external_id = 'W-1';
insert into public.events (id, job_id, source, external_id, event_type, provenance, producer, time_kind, occurred_at_raw)
select gen_random_uuid(), id, 'c02-supplied', 'E-2', 'approval request prepared', 'SUPPLIED', 'fixture-loader', 'clock', '08:50'
from public.jobs where source = 'c02-supplied' and external_id = 'W-2';

-- All tables must have rows before testing RLS visibility.
do $$ begin
  if (select count(*) from public.jobs) <> 4 or
     (select count(*) from public.job_claims) <> 14 or
     (select count(*) from public.events) <> 2 then
    raise exception 'Unexpected fixture-shaped row counts; use an empty local database';
  end if;
  if (select count(*) from public.events where time_kind = 'clock' and occurred_at is null and
      ((external_id = 'R-1' and occurred_at_raw = '08:40') or
       (external_id = 'E-2' and occurred_at_raw = '08:50'))) <> 2 then
    raise exception 'Clock uncertainty was lost';
  end if;
end $$;

-- Constraint and append-only tests run as administrator, independently of RLS.
do $$
declare
  table_name text;
  operation text;
  job_uuid uuid := (select id from public.jobs where external_id = 'W-1');
begin
  -- Invalid canonical / downstream provenance must not enter source storage.
  begin
    perform 'INVALID'::public.source_provenance;
    raise exception 'Invalid provenance was accepted';
  exception when invalid_text_representation then null; end;
  begin
    perform 'GENERATED'::public.source_provenance;
    raise exception 'Generated provenance was accepted';
  exception when invalid_text_representation then null; end;
  begin
    perform 'HUMAN_VALIDATED'::public.source_provenance;
    raise exception 'Human validation was accepted';
  exception when invalid_text_representation then null; end;
  begin
    insert into public.jobs (id, source, external_id, provenance, producer)
    values (gen_random_uuid(), 'synthetic:demo', 'spoof', 'SUPPLIED', 'simulator');
    raise exception 'Provenance metadata spoofing was accepted';
  exception when check_violation then null; end;

  -- Natural uniqueness applies even with a different internal UUID.
  begin
    insert into public.jobs (id, source, external_id, provenance, producer)
    select gen_random_uuid(), source, external_id, provenance, producer from public.jobs where id = job_uuid;
    raise exception 'Duplicate natural job identity was accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
    select gen_random_uuid(), job_id, source, source_record_ref, property, value, provenance, producer
    from public.job_claims where job_id = job_uuid and property = 'stage';
    raise exception 'Duplicate natural claim identity was accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.events (id, job_id, source, external_id, event_type, provenance, producer, time_kind, occurred_at_raw)
    select gen_random_uuid(), job_id, source, external_id, event_type, provenance, producer, time_kind, occurred_at_raw
    from public.events where external_id = 'R-1';
    raise exception 'Duplicate natural event identity was accepted';
  exception when unique_violation then null; end;

  -- Verify both foreign-key boundaries.
  begin
    insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
    values (gen_random_uuid(), '00000000-0000-4000-8000-000000000099', 'c02-supplied', 'missing-job', 'stage', 'recorded', 'SUPPLIED', 'fixture-loader');
    raise exception 'Unknown claim job was accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.events (id, job_id, source, external_id, event_type, provenance, producer, time_kind)
    values (gen_random_uuid(), '00000000-0000-4000-8000-000000000099', 'c02-supplied', 'missing-job', 'scan', 'SUPPLIED', 'fixture-loader', 'unknown');
    raise exception 'Unknown event job was accepted';
  exception when foreign_key_violation then null; end;

  -- Every table rejects UPDATE (including no-op UPDATE), DELETE, and TRUNCATE.
  foreach table_name in array array['jobs', 'job_claims', 'events'] loop
    foreach operation in array array[
      format('update public.%I set provenance = provenance', table_name),
      format('delete from public.%I', table_name),
      format('truncate public.%I cascade', table_name)
    ] loop
      begin
        execute operation;
        raise exception 'Source mutation was accepted: %', operation;
      exception when sqlstate '55000' then null; end;
    end loop;
  end loop;
end $$;

-- Temporal constraints: invalid combinations are not workshop observations.
do $$
declare
  candidate record;
  job_uuid uuid := (select id from public.jobs where external_id = 'W-1');
begin
  for candidate in select * from (values
    ('clock', '25:00', null::timestamptz),
    ('clock', '08:60', null::timestamptz),
    ('clock', '8:40', null::timestamptz),
    ('clock', '08:40Z', null::timestamptz),
    ('clock', E'08:40\n', null::timestamptz),
    ('clock', null, null::timestamptz),
    ('clock', '08:40', '2026-09-17T08:40:00Z'::timestamptz),
    ('timestamp', '2026-09-17T08:40:00Z', null::timestamptz),
    ('timestamp', null, '2026-09-17T08:40:00Z'::timestamptz),
    ('timestamp', '2026-09-17T08:40:00', '2026-09-17T08:40:00Z'::timestamptz),
    ('timestamp', '2026-09-17T08:40:00Z', '2026-09-17T09:40:00Z'::timestamptz),
    ('unknown', '08:40', null::timestamptz),
    ('unknown', null, '2026-09-17T08:40:00Z'::timestamptz)
  ) as times(kind, raw, instant) loop
    begin
      insert into public.events (id, job_id, source, external_id, event_type, provenance, producer, time_kind, occurred_at_raw, occurred_at)
      values (gen_random_uuid(), job_uuid, 'c02-supplied', 'invalid-time', 'scan', 'SUPPLIED', 'fixture-loader', candidate.kind, candidate.raw, candidate.instant);
      raise exception 'Invalid time combination was accepted: %', candidate;
    exception when check_violation then null; end;
  end loop;
  begin
    insert into public.events (id, job_id, source, external_id, event_type, provenance, producer, time_kind, occurred_at_raw, occurred_at)
    values (gen_random_uuid(), job_uuid, 'c02-supplied', 'invalid-date', 'scan', 'SUPPLIED', 'fixture-loader',
      'timestamp', '2026-02-30T08:40:00Z', '2026-03-02T08:40:00Z');
    raise exception 'Invalid calendar date was accepted';
  exception when datetime_field_overflow or invalid_datetime_format or check_violation then null; end;

  -- Valid unknown and explicit-offset timestamps (local test observations only).
  insert into public.events (id, job_id, source, external_id, event_type, provenance, producer, time_kind)
  values (gen_random_uuid(), job_uuid, 'synthetic:sql-regression', 'local-unknown', 'scan', 'SYNTHETIC', 'sql-regression', 'unknown');
  insert into public.events (id, job_id, source, external_id, event_type, provenance, producer, time_kind, occurred_at_raw, occurred_at)
  values (gen_random_uuid(), job_uuid, 'synthetic:sql-regression', 'local-timestamp', 'scan', 'SYNTHETIC', 'sql-regression',
    'timestamp', '2026-09-17T08:40:00+01:00', '2026-09-17T07:40:00Z');
end $$;

-- Verify effective privileges, absence of policies, and enabled/forced RLS.
do $$ begin
  if exists (
    select from (values ('anon'), ('authenticated'), ('service_role')) as roles(name)
    cross join (values ('public.jobs'), ('public.job_claims'), ('public.events')) as tables(name)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as operations(name)
    where has_table_privilege(roles.name, tables.name, operations.name)
  ) then raise exception 'Unexpected application/server grant'; end if;
  if exists (
    select from pg_class join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public' and pg_class.relname in ('jobs', 'job_claims', 'events')
      and (not pg_class.relrowsecurity or not pg_class.relforcerowsecurity)
  ) then raise exception 'Source table RLS is not enabled and forced'; end if;
  if exists (
    select from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public' and pg_class.relname in ('jobs', 'job_claims', 'events')
  ) then raise exception 'Unexpected source access policy'; end if;
end $$;

-- Production grants: all operations must fail at the privilege boundary.
set local role anon;
do $$
declare table_name text; operation text;
begin
  foreach table_name in array array['jobs', 'job_claims', 'events'] loop
    foreach operation in array array[
      format('select count(*) from public.%I', table_name),
      format('insert into public.%I select * from public.%I where false', table_name, table_name),
      format('update public.%I set provenance = provenance', table_name),
      format('delete from public.%I', table_name)
    ] loop
      begin
        execute operation;
        raise exception 'Privilege boundary accepted operation: %', operation;
      exception when insufficient_privilege then null; end;
    end loop;
  end loop;
end $$;
reset role;

-- Production grants: all operations must fail at the privilege boundary.
set local role authenticated;
do $$
declare table_name text; operation text;
begin
  foreach table_name in array array['jobs', 'job_claims', 'events'] loop
    foreach operation in array array[
      format('select count(*) from public.%I', table_name),
      format('insert into public.%I select * from public.%I where false', table_name, table_name),
      format('update public.%I set provenance = provenance', table_name),
      format('delete from public.%I', table_name)
    ] loop
      begin
        execute operation;
        raise exception 'Privilege boundary accepted operation: %', operation;
      exception when insufficient_privilege then null; end;
    end loop;
  end loop;
end $$;
reset role;

-- Production grants: all operations must fail at the privilege boundary.
set local role service_role;
do $$
declare table_name text; operation text;
begin
  foreach table_name in array array['jobs', 'job_claims', 'events'] loop
    foreach operation in array array[
      format('select count(*) from public.%I', table_name),
      format('insert into public.%I select * from public.%I where false', table_name, table_name),
      format('update public.%I set provenance = provenance', table_name),
      format('delete from public.%I', table_name)
    ] loop
      begin
        execute operation;
        raise exception 'Privilege boundary accepted operation: %', operation;
      exception when insufficient_privilege then null; end;
    end loop;
  end loop;
end $$;
reset role;

-- Test-only grants isolate RLS from privilege denial. No permissive policies.
-- Constraint-function execution is also granted so it cannot mask a missing
-- RLS INSERT policy. Every grant below is undone by the final rollback.
grant select, insert, update, delete on public.jobs, public.job_claims, public.events to anon, authenticated;
grant execute on function public.valid_source_metadata(public.source_provenance, text, text) to anon, authenticated;

set local role anon;
do $$
declare table_name text; affected bigint;
begin
  foreach table_name in array array['jobs', 'job_claims', 'events'] loop
    execute format('select count(*) from public.%I', table_name) into affected;
    if affected <> 0 then raise exception 'anon saw source rows through RLS'; end if;
    execute format('update public.%I set provenance = provenance', table_name);
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'anon updated rows through RLS'; end if;
    execute format('delete from public.%I', table_name);
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'anon deleted rows through RLS'; end if;
  end loop;
  begin
    insert into public.jobs (id, source, external_id, provenance, producer)
    values ('00000000-0000-4000-8000-000000000101', 'c02-supplied', 'rls-insert', 'SUPPLIED', 'fixture-loader');
    raise exception 'anon inserted a job without an RLS policy';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
    values ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000099',
      'c02-supplied', 'rls-insert', 'stage', 'recorded', 'SUPPLIED', 'fixture-loader');
    raise exception 'anon inserted a claim without an RLS policy';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.events (id, job_id, source, external_id, event_type, provenance, producer, time_kind)
    values ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000099',
      'c02-supplied', 'rls-insert', 'scan', 'SUPPLIED', 'fixture-loader', 'unknown');
    raise exception 'anon inserted an event without an RLS policy';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
do $$
declare table_name text; affected bigint;
begin
  foreach table_name in array array['jobs', 'job_claims', 'events'] loop
    execute format('select count(*) from public.%I', table_name) into affected;
    if affected <> 0 then raise exception 'authenticated saw source rows through RLS'; end if;
    execute format('update public.%I set provenance = provenance', table_name);
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'authenticated updated rows through RLS'; end if;
    execute format('delete from public.%I', table_name);
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'authenticated deleted rows through RLS'; end if;
  end loop;
  begin
    insert into public.jobs (id, source, external_id, provenance, producer)
    values ('00000000-0000-4000-8000-000000000101', 'c02-supplied', 'rls-insert', 'SUPPLIED', 'fixture-loader');
    raise exception 'authenticated inserted a job without an RLS policy';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
    values ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000099',
      'c02-supplied', 'rls-insert', 'stage', 'recorded', 'SUPPLIED', 'fixture-loader');
    raise exception 'authenticated inserted a claim without an RLS policy';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.events (id, job_id, source, external_id, event_type, provenance, producer, time_kind)
    values ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000099',
      'c02-supplied', 'rls-insert', 'scan', 'SUPPLIED', 'fixture-loader', 'unknown');
    raise exception 'authenticated inserted an event without an RLS policy';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- No source rows were altered by the RLS or mutation probes.
do $$ begin
  if (select count(*) from public.jobs) <> 4 or
     (select count(*) from public.job_claims) <> 14 or
     (select count(*) from public.events) <> 4 then
    raise exception 'Regression probes changed source data';
  end if;
end $$;
rollback;
