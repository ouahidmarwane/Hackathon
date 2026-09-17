-- LOCAL REVIEW ONLY. Do not apply remotely without explicit approval.
begin;

-- M06 human decision layer. Append-only, server-owned, fail-closed.
-- jobs / job_claims / events grants and RLS are untouched: no weakening.
create table public.human_decisions (
  id uuid primary key,
  job_id uuid not null references public.jobs(id) on delete restrict,
  investigation_plan_id uuid not null,
  decision_type text not null check (decision_type in ('APPROVED', 'CORRECTED')),
  selected_next_step text not null check (
    length(selected_next_step) between 1 and 400
    and selected_next_step = btrim(selected_next_step)
    and selected_next_step !~ '[[:cntrl:]]'
  ),
  correction_text text check (
    correction_text is null or (
      length(correction_text) between 1 and 1000
      and correction_text = btrim(correction_text)
      and correction_text !~ '[[:cntrl:]]'
    )
  ),
  correction_reason text check (
    correction_reason is null or (
      length(correction_reason) between 1 and 200
      and correction_reason = btrim(correction_reason)
      and correction_reason !~ '[[:cntrl:]]'
    )
  ),
  human_evidence_reference text check (
    human_evidence_reference is null or (
      length(human_evidence_reference) between 1 and 200
      and human_evidence_reference = btrim(human_evidence_reference)
      and human_evidence_reference !~ '[[:cntrl:]]'
    )
  ),
  reviewer text not null check (
    length(reviewer) between 1 and 200
    and reviewer = btrim(reviewer)
    and reviewer !~ '[[:cntrl:]]'
  ),
  provenance text not null check (provenance = 'HUMAN_VALIDATED'),
  source_generated_plan_version text not null check (
    length(source_generated_plan_version) between 1 and 200
    and source_generated_plan_version = btrim(source_generated_plan_version)
    and source_generated_plan_version !~ '[[:cntrl:]]'
  ),
  source_finding_ids text[] not null,
  source_claim_ids uuid[] not null,
  source_event_ids uuid[] not null,
  created_at timestamptz not null default now(),
  check (
    (decision_type = 'APPROVED' and correction_text is null)
    or
    (decision_type = 'CORRECTED' and correction_text is not null)
  )
);
create index human_decisions_job_id_idx on public.human_decisions(job_id);
create index human_decisions_investigation_plan_id_idx on public.human_decisions(investigation_plan_id);

-- Append-only, like source records. A later different decision is a NEW row.
create function public.reject_human_decision_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Human decisions are append-only' using errcode = '55000';
end;
$$;
create trigger human_decisions_append_only before update or delete on public.human_decisions
  for each row execute function public.reject_human_decision_mutation();
create trigger human_decisions_no_truncate before truncate on public.human_decisions
  for each statement execute function public.reject_human_decision_mutation();

alter table public.human_decisions enable row level security;
alter table public.human_decisions force row level security;

-- Server-owned write only. No policies; service_role has BYPASSRLS. Browser
-- roles (anon/authenticated) get no privilege and no policy. UPDATE/DELETE/
-- TRUNCATE are never granted anywhere and are additionally blocked by triggers.
revoke all on public.human_decisions from public, anon, authenticated, service_role;
grant insert, select on public.human_decisions to service_role;
revoke all on function public.reject_human_decision_mutation() from public, anon, authenticated, service_role;

commit;
