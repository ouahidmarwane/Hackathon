-- LOCAL REVIEW ONLY. Do not apply remotely without explicit approval.
begin;

create type public.source_provenance as enum ('SUPPLIED', 'SYNTHETIC', 'INTEGRATION');

-- Source rows exclude GENERATED and HUMAN_VALIDATED until their downstream
-- producer/approval boundaries exist. The five-value domain contract is unchanged.
create function public.valid_source_metadata(
  provenance public.source_provenance, source text, producer text
) returns boolean language sql immutable set search_path = '' as $$
  select source ~ '^[a-z0-9][a-z0-9._:-]*$'
    and source !~ '[[:cntrl:]]'
    and length(source) between 1 and 200
    and length(producer) between 1 and 200
    and producer = btrim(producer) and producer !~ '[[:cntrl:]]'
    and case provenance
      when 'SUPPLIED' then source = 'c02-supplied' and producer = 'fixture-loader'
      when 'SYNTHETIC' then source like 'synthetic:%'
      when 'INTEGRATION' then source like 'integration:%'
    end;
$$;

create table public.jobs (
  id uuid primary key,
  source text not null,
  external_id text not null check (length(external_id) between 1 and 200 and external_id = btrim(external_id) and external_id !~ '[[:cntrl:]]'),
  provenance public.source_provenance not null,
  producer text not null,
  created_at timestamptz not null default now(),
  unique (source, external_id),
  check (public.valid_source_metadata(provenance, source, producer))
);

create table public.job_claims (
  id uuid primary key,
  job_id uuid not null references public.jobs(id) on delete restrict,
  source text not null,
  source_record_ref text not null check (length(source_record_ref) between 1 and 200 and source_record_ref = btrim(source_record_ref) and source_record_ref !~ '[[:cntrl:]]'),
  property text not null check (length(property) between 1 and 200 and property = btrim(property) and property !~ '[[:cntrl:]]'),
  value text not null check (length(value) between 1 and 200 and value = btrim(value) and value !~ '[[:cntrl:]]'),
  provenance public.source_provenance not null,
  producer text not null,
  recorded_at timestamptz,
  effective_from timestamptz,
  created_at timestamptz not null default now(),
  unique (source, source_record_ref, property),
  check (public.valid_source_metadata(provenance, source, producer))
);
create index job_claims_job_id_idx on public.job_claims(job_id);

create table public.events (
  id uuid primary key,
  job_id uuid not null references public.jobs(id) on delete restrict,
  source text not null,
  external_id text not null check (length(external_id) between 1 and 200 and external_id = btrim(external_id) and external_id !~ '[[:cntrl:]]'),
  event_type text not null check (length(event_type) between 1 and 200 and event_type = btrim(event_type) and event_type !~ '[[:cntrl:]]'),
  provenance public.source_provenance not null,
  producer text not null,
  time_kind text not null check (time_kind in ('unknown', 'clock', 'timestamp')),
  occurred_at_raw text,
  occurred_at timestamptz,
  ingested_at timestamptz not null default now(),
  unique (source, external_id),
  check (public.valid_source_metadata(provenance, source, producer)),
  check (occurred_at_raw is null or (
    length(occurred_at_raw) between 1 and 200
    and occurred_at_raw = btrim(occurred_at_raw)
    and occurred_at_raw !~ '[[:cntrl:]]'
  )),
  check (case time_kind
    when 'unknown' then occurred_at_raw is null and occurred_at is null
    when 'clock' then occurred_at is null and occurred_at_raw is not null
      and occurred_at_raw ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
    when 'timestamp' then occurred_at is not null and occurred_at_raw is not null
      and occurred_at_raw ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,3})?(Z|[+-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00))$'
      and occurred_at = occurred_at_raw::timestamptz
    else false end)
);
create index events_job_id_idx on public.events(job_id);

-- All source rows are immutable, including provenance and ingestion metadata.
-- Superseding claims need a NEW source record reference, not an UPDATE.
create function public.reject_source_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Source records are append-only' using errcode = '55000';
end;
$$;
create trigger jobs_append_only before update or delete on public.jobs
  for each row execute function public.reject_source_mutation();
create trigger claims_append_only before update or delete on public.job_claims
  for each row execute function public.reject_source_mutation();
create trigger events_append_only before update or delete on public.events
  for each row execute function public.reject_source_mutation();
-- TRUNCATE does not fire row-level DELETE triggers or consult RLS.
create trigger jobs_no_truncate before truncate on public.jobs
  for each statement execute function public.reject_source_mutation();
create trigger claims_no_truncate before truncate on public.job_claims
  for each statement execute function public.reject_source_mutation();
create trigger events_no_truncate before truncate on public.events
  for each statement execute function public.reject_source_mutation();

alter table public.jobs enable row level security;
alter table public.job_claims enable row level security;
alter table public.events enable row level security;
alter table public.jobs force row level security;
alter table public.job_claims force row level security;
alter table public.events force row level security;
-- No application access is needed in M02; no policies or public write RPCs.
-- No M02 application writer exists, including a privileged server writer.
-- BYPASSRLS does not itself grant table privileges. Future access needs review.
revoke all on public.jobs, public.job_claims, public.events from public, anon, authenticated, service_role;
revoke all on function public.valid_source_metadata(public.source_provenance, text, text) from public, anon, authenticated, service_role;
revoke all on function public.reject_source_mutation() from public, anon, authenticated, service_role;

commit;
