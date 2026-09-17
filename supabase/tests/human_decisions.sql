-- LOCAL ONLY: standalone PostgreSQL regression, no pgTAP dependency.
-- Requires the M06 migration applied to a disposable local database with
-- Supabase roles, run as an administrator with BYPASSRLS / superuser rights.
-- Use psql -X -v ON_ERROR_STOP=1 -f <this-file>; every change rolls back.
begin;

-- Minimal valid source fixture the decision table can reference.
insert into public.jobs (id, source, external_id, provenance, producer)
values ('10000000-0000-4000-8000-000000000001', 'c02-supplied', 'W-1', 'SUPPLIED', 'fixture-loader');
insert into public.job_claims (id, job_id, source, source_record_ref, property, value, provenance, producer)
values ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
  'c02-supplied', 'W-1', 'stage', 'awaiting parts', 'SUPPLIED', 'fixture-loader');
insert into public.events (id, job_id, source, external_id, event_type, provenance, producer, time_kind, occurred_at_raw)
values ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
  'c02-supplied', 'R-1', 'part scan', 'SUPPLIED', 'fixture-loader', 'clock', '08:40');

-- Constraint and append-only tests run as administrator, independently of RLS.
do $$
declare
  job_uuid uuid := '10000000-0000-4000-8000-000000000001';
  claim_uuid uuid := '10000000-0000-4000-8000-000000000002';
  event_uuid uuid := '10000000-0000-4000-8000-000000000003';
begin
  -- Valid APPROVED decision.
  insert into public.human_decisions (id, job_id, investigation_plan_id, decision_type,
    selected_next_step, correction_text, correction_reason, human_evidence_reference,
    reviewer, provenance, source_generated_plan_version, source_finding_ids,
    source_claim_ids, source_event_ids)
  values (gen_random_uuid(), job_uuid, gen_random_uuid(), 'APPROVED',
    'Confirm the part-to-job / technician handoff before proposing a workflow status change.',
    null, null, null, 'Prototype reviewer', 'HUMAN_VALIDATED', 'investigation/c02/v1',
    array['finding:1'], array[claim_uuid], array[event_uuid]);

  -- Valid CORRECTED decision with meaningful correction text.
  insert into public.human_decisions (id, job_id, investigation_plan_id, decision_type,
    selected_next_step, correction_text, correction_reason, human_evidence_reference,
    reviewer, provenance, source_generated_plan_version, source_finding_ids,
    source_claim_ids, source_event_ids)
  values (gen_random_uuid(), job_uuid, gen_random_uuid(), 'CORRECTED',
    'Confirm the part-to-job / technician handoff before proposing a workflow status change.',
    'The scanned item belongs to another work order.', null, null, 'Prototype reviewer',
    'HUMAN_VALIDATED', 'investigation/c02/v1', array['finding:2'],
    array[claim_uuid], array[event_uuid]);

  -- APPROVED must not carry correction text.
  begin
    insert into public.human_decisions (id, job_id, investigation_plan_id, decision_type,
      selected_next_step, correction_text, correction_reason, human_evidence_reference,
      reviewer, provenance, source_generated_plan_version, source_finding_ids,
      source_claim_ids, source_event_ids)
    values (gen_random_uuid(), job_uuid, gen_random_uuid(), 'APPROVED',
      'next step', 'correction must not be allowed', null, null, 'Prototype reviewer',
      'HUMAN_VALIDATED', 'investigation/c02/v1', array['finding:3'], array[claim_uuid], array[event_uuid]);
    raise exception 'Approval with correction text was accepted';
  exception when check_violation then null; end;

  -- CORRECTED must have meaningful correction text.
  begin
    insert into public.human_decisions (id, job_id, investigation_plan_id, decision_type,
      selected_next_step, correction_text, correction_reason, human_evidence_reference,
      reviewer, provenance, source_generated_plan_version, source_finding_ids,
      source_claim_ids, source_event_ids)
    values (gen_random_uuid(), job_uuid, gen_random_uuid(), 'CORRECTED',
      'next step', null, null, null, 'Prototype reviewer',
      'HUMAN_VALIDATED', 'investigation/c02/v1', array['finding:4'], array[claim_uuid], array[event_uuid]);
    raise exception 'Correction without text was accepted';
  exception when check_violation then null; end;

  -- Provenance is pinned to HUMAN_VALIDATED.
  begin
    insert into public.human_decisions (id, job_id, investigation_plan_id, decision_type,
      selected_next_step, correction_text, correction_reason, human_evidence_reference,
      reviewer, provenance, source_generated_plan_version, source_finding_ids,
      source_claim_ids, source_event_ids)
    values (gen_random_uuid(), job_uuid, gen_random_uuid(), 'APPROVED',
      'next step', null, null, null, 'Prototype reviewer',
      'GENERATED', 'investigation/c02/v1', array['finding:5'], array[claim_uuid], array[event_uuid]);
    raise exception 'Non-human provenance was accepted';
  exception when check_violation then null; end;

  -- Control characters are rejected in human text.
  begin
    insert into public.human_decisions (id, job_id, investigation_plan_id, decision_type,
      selected_next_step, correction_text, correction_reason, human_evidence_reference,
      reviewer, provenance, source_generated_plan_version, source_finding_ids,
      source_claim_ids, source_event_ids)
    values (gen_random_uuid(), job_uuid, gen_random_uuid(), 'CORRECTED',
      'next step', E'hidden\ncontrol', null, null, 'Prototype reviewer',
      'HUMAN_VALIDATED', 'investigation/c02/v1', array['finding:6'], array[claim_uuid], array[event_uuid]);
    raise exception 'Control character correction was accepted';
  exception when check_violation then null; end;

  -- Unknown job reference is rejected.
  begin
    insert into public.human_decisions (id, job_id, investigation_plan_id, decision_type,
      selected_next_step, correction_text, correction_reason, human_evidence_reference,
      reviewer, provenance, source_generated_plan_version, source_finding_ids,
      source_claim_ids, source_event_ids)
    values (gen_random_uuid(), '00000000-0000-4000-8000-000000000099', gen_random_uuid(), 'APPROVED',
      'next step', null, null, null, 'Prototype reviewer',
      'HUMAN_VALIDATED', 'investigation/c02/v1', array['finding:7'], array[claim_uuid], array[event_uuid]);
    raise exception 'Unknown job decision was accepted';
  exception when foreign_key_violation then null; end;

  -- Append-only: UPDATE, no-op UPDATE, DELETE and TRUNCATE are rejected.
  begin
    update public.human_decisions set provenance = provenance;
    raise exception 'Decision UPDATE was accepted';
  exception when sqlstate '55000' then null; end;
  begin
    delete from public.human_decisions;
    raise exception 'Decision DELETE was accepted';
  exception when sqlstate '55000' then null; end;
  begin
    truncate public.human_decisions;
    raise exception 'Decision TRUNCATE was accepted';
  exception when sqlstate '55000' then null; end;
end $$;

-- Effective privileges, absent policies, enabled/forced RLS.
do $$ begin
  if exists (
    select from (values ('anon'), ('authenticated')) as roles(name)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as operations(name)
    where has_table_privilege(roles.name, 'public.human_decisions', operations.name)
  ) then raise exception 'Unexpected browser decision grant'; end if;
  if not has_table_privilege('service_role', 'public.human_decisions', 'INSERT')
     or not has_table_privilege('service_role', 'public.human_decisions', 'SELECT') then
    raise exception 'Missing service_role decision grant';
  end if;
  if exists (
    select from (values ('service_role')) as roles(name)
    cross join (values ('UPDATE'), ('DELETE'), ('TRUNCATE')) as operations(name)
    where has_table_privilege(roles.name, 'public.human_decisions', operations.name)
  ) then raise exception 'Unexpected service_role decision mutation grant'; end if;
  -- Source tables stay fail-closed for every application/server role.
  if exists (
    select from (values ('anon'), ('authenticated'), ('service_role')) as roles(name)
    cross join (values ('public.jobs'), ('public.job_claims'), ('public.events')) as tables(name)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as operations(name)
    where has_table_privilege(roles.name, tables.name, operations.name)
  ) then raise exception 'Unexpected application/server source grant'; end if;
  if exists (
    select from pg_class join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public' and pg_class.relname = 'human_decisions'
      and (not pg_class.relrowsecurity or not pg_class.relforcerowsecurity)
  ) then raise exception 'Decision table RLS is not enabled and forced'; end if;
  if exists (
    select from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public' and pg_class.relname = 'human_decisions'
  ) then raise exception 'Unexpected decision access policy'; end if;
end $$;

-- Browser roles fail at the privilege boundary for every operation.
set local role anon;
do $$ begin
  begin
    perform count(*) from public.human_decisions;
    raise exception 'anon read decisions';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.human_decisions (id, job_id, investigation_plan_id, decision_type,
      selected_next_step, correction_text, correction_reason, human_evidence_reference,
      reviewer, provenance, source_generated_plan_version, source_finding_ids,
      source_claim_ids, source_event_ids)
    values ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001',
      gen_random_uuid(), 'APPROVED', 'next step', null, null, null, 'Prototype reviewer',
      'HUMAN_VALIDATED', 'investigation/c02/v1', array['finding:8'],
      array['10000000-0000-4000-8000-000000000002']::uuid[],
      array['10000000-0000-4000-8000-000000000003']::uuid[]);
    raise exception 'anon inserted a decision';
  exception when insufficient_privilege then null; end;
  begin
    update public.human_decisions set provenance = provenance;
    raise exception 'anon updated decisions';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.human_decisions;
    raise exception 'anon deleted decisions';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
do $$ begin
  begin
    perform count(*) from public.human_decisions;
    raise exception 'authenticated read decisions';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.human_decisions (id, job_id, investigation_plan_id, decision_type,
      selected_next_step, correction_text, correction_reason, human_evidence_reference,
      reviewer, provenance, source_generated_plan_version, source_finding_ids,
      source_claim_ids, source_event_ids)
    values ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001',
      gen_random_uuid(), 'APPROVED', 'next step', null, null, null, 'Prototype reviewer',
      'HUMAN_VALIDATED', 'investigation/c02/v1', array['finding:9'],
      array['10000000-0000-4000-8000-000000000002']::uuid[],
      array['10000000-0000-4000-8000-000000000003']::uuid[]);
    raise exception 'authenticated inserted a decision';
  exception when insufficient_privilege then null; end;
  begin
    update public.human_decisions set provenance = provenance;
    raise exception 'authenticated updated decisions';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.human_decisions;
    raise exception 'authenticated deleted decisions';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- No source rows were altered by the regression probes.
do $$ begin
  if (select count(*) from public.jobs) <> 1
     or (select count(*) from public.job_claims) <> 1
     or (select count(*) from public.events) <> 1
     or (select count(*) from public.human_decisions) <> 2 then
    raise exception 'Regression probes changed persisted data';
  end if;
end $$;
rollback;
