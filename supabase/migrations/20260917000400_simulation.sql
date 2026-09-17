-- LOCAL REVIEW ONLY. Do not apply remotely without explicit approval.
begin;

-- M11 NOVA live pipeline. Dedicated append-oriented simulation persistence.
-- W-1..W-4, jobs, job_claims, events, human_decisions and memories are untouched.

create table public.simulation_runs (
  id uuid primary key,
  external_id text not null unique check (
    length(external_id) between 1 and 200
    and external_id = btrim(external_id)
    and external_id !~ '[[:cntrl:]]'
  ),
  run_number int not null unique check (run_number > 0),
  current_stage text not null check (
    current_stage in ('RECEPTION','DIAGNOSIS','PARTS_APPROVAL','REPAIR','QUALITY_CHECK','READY','COLLECTION')
  ),
  stage_status text not null check (
    stage_status in ('ACTIVE','WAITING_FOR_EVIDENCE','WAITING_FOR_APPROVAL','COMPLETED')
  ),
  run_status text not null check (run_status in ('RUNNING','BLOCKED','COMPLETED')),
  incident_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.simulation_claims (
  id uuid primary key,
  run_id uuid not null references public.simulation_runs(id) on delete restrict,
  property text not null check (
    length(property) between 1 and 200
    and property = btrim(property)
    and property !~ '[[:cntrl:]]'
  ),
  value text not null check (
    length(value) between 1 and 200
    and value = btrim(value)
    and value !~ '[[:cntrl:]]'
  ),
  provenance text not null check (provenance = 'SYNTHETIC'),
  created_at timestamptz not null default now(),
  unique (run_id, property)
);

create table public.simulation_events (
  id uuid primary key,
  run_id uuid not null references public.simulation_runs(id) on delete restrict,
  external_id text not null check (
    length(external_id) between 1 and 200
    and external_id = btrim(external_id)
    and external_id !~ '[[:cntrl:]]'
  ),
  event_type text not null check (
    length(event_type) between 1 and 200
    and event_type = btrim(event_type)
    and event_type !~ '[[:cntrl:]]'
  ),
  provenance text not null check (provenance = 'SYNTHETIC'),
  created_at timestamptz not null default now(),
  unique (run_id, external_id)
);

create table public.simulation_approvals (
  id uuid primary key,
  run_id uuid not null references public.simulation_runs(id) on delete restrict,
  from_stage text not null check (
    from_stage in ('RECEPTION','DIAGNOSIS','PARTS_APPROVAL','REPAIR','QUALITY_CHECK','READY','COLLECTION')
  ),
  to_stage text not null check (
    to_stage in ('RECEPTION','DIAGNOSIS','PARTS_APPROVAL','REPAIR','QUALITY_CHECK','READY','COLLECTION','COMPLETED')
  ),
  reviewer text not null check (
    length(reviewer) between 1 and 200
    and reviewer = btrim(reviewer)
    and reviewer !~ '[[:cntrl:]]'
  ),
  channel text not null check (channel in ('WEB','TELEGRAM')),
  provenance text not null check (provenance = 'HUMAN_VALIDATED'),
  created_at timestamptz not null default now(),
  unique (run_id, from_stage, to_stage)
);
create index simulation_approvals_run_id_idx on public.simulation_approvals(run_id);
create index simulation_claims_run_id_idx on public.simulation_claims(run_id);
create index simulation_events_run_id_idx on public.simulation_events(run_id);

-- simulation_claims/events/approvals are append-only. simulation_runs is the
-- authoritative mutable stage tracker, updated only by the server.
create function public.reject_simulation_append_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Simulation records are append-only' using errcode = '55000';
end;
$$;
create trigger simulation_claims_append_only before update or delete on public.simulation_claims
  for each row execute function public.reject_simulation_append_mutation();
create trigger simulation_claims_no_truncate before truncate on public.simulation_claims
  for each statement execute function public.reject_simulation_append_mutation();
create trigger simulation_events_append_only before update or delete on public.simulation_events
  for each row execute function public.reject_simulation_append_mutation();
create trigger simulation_events_no_truncate before truncate on public.simulation_events
  for each statement execute function public.reject_simulation_append_mutation();
create trigger simulation_approvals_append_only before update or delete on public.simulation_approvals
  for each row execute function public.reject_simulation_append_mutation();
create trigger simulation_approvals_no_truncate before truncate on public.simulation_approvals
  for each statement execute function public.reject_simulation_append_mutation();

alter table public.simulation_runs enable row level security;
alter table public.simulation_claims enable row level security;
alter table public.simulation_events enable row level security;
alter table public.simulation_approvals enable row level security;
alter table public.simulation_runs force row level security;
alter table public.simulation_claims force row level security;
alter table public.simulation_events force row level security;
alter table public.simulation_approvals force row level security;

-- Server-owned: service_role gets insert/select on all four tables plus update
-- on the mutable run tracker. Browser roles get nothing; no policies exist.
revoke all on public.simulation_runs, public.simulation_claims, public.simulation_events, public.simulation_approvals
  from public, anon, authenticated, service_role;
grant insert, select on public.simulation_runs, public.simulation_claims, public.simulation_events, public.simulation_approvals to service_role;
grant update on public.simulation_runs to service_role;
revoke all on function public.reject_simulation_append_mutation() from public, anon, authenticated, service_role;

commit;
