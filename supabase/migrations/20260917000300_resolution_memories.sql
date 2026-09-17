-- M09 resolution memories. Append-only, server-owned, fail-closed.
-- jobs / job_claims / events / human_decisions grants and RLS are untouched.
begin;

create table public.resolution_memories (
  id uuid primary key,
  job_id uuid not null references public.jobs(id) on delete restrict,
  external_job_id text not null check (
    length(external_job_id) between 1 and 200
    and external_job_id = btrim(external_job_id)
    and external_job_id !~ '[[:cntrl:]]'
  ),
  decision_id uuid references public.human_decisions(id) on delete set null,
  stage text not null check (
    length(stage) between 1 and 100
    and stage = btrim(stage)
    and stage !~ '[[:cntrl:]]'
  ),
  missing_evidence_codes text[] not null default '{}',
  rule_code text check (
    rule_code is null or (
      length(rule_code) between 1 and 100
      and rule_code = btrim(rule_code)
      and rule_code !~ '[[:cntrl:]]'
    )
  ),
  category text not null check (
    category in ('PARTS_HANDOFF', 'APPROVAL_DISPATCH', 'QUALITY_CHECK', 'READINESS', 'STAGE_VERIFICATION', 'GENERAL')
  ),
  lesson text not null check (
    length(lesson) between 5 and 1000
    and lesson = btrim(lesson)
    and lesson !~ '[[:cntrl:]]'
  ),
  source_refs text[] not null default '{}',
  validated_by text not null check (
    length(validated_by) between 1 and 200
    and validated_by = btrim(validated_by)
    and validated_by !~ '[[:cntrl:]]'
  ),
  provenance text not null check (provenance = 'HUMAN_VALIDATED'),
  created_at timestamptz not null default now()
);

create index resolution_memories_job_id_idx on public.resolution_memories(job_id);
create index resolution_memories_category_idx on public.resolution_memories(category);

-- Append-only. A later correction or lesson is a NEW row.
create function public.reject_resolution_memory_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Resolution memories are append-only' using errcode = '55000';
end;
$$;

create trigger resolution_memories_append_only before update or delete on public.resolution_memories
  for each row execute function public.reject_resolution_memory_mutation();
create trigger resolution_memories_no_truncate before truncate on public.resolution_memories
  for each statement execute function public.reject_resolution_memory_mutation();

alter table public.resolution_memories enable row level security;
alter table public.resolution_memories force row level security;

-- Server-owned write only. No browser policies; service_role has BYPASSRLS.
revoke all on public.resolution_memories from public, anon, authenticated, service_role;
grant insert, select on public.resolution_memories to service_role;
revoke all on function public.reject_resolution_memory_mutation() from public, anon, authenticated, service_role;

commit;

