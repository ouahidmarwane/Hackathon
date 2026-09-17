# Operational model: M02 review candidate

Status: M02/M02.1 reviewed; the migration was applied to the existing Supabase
project under M02.2 authorization. PostgreSQL regression, C02 loading and a
second identical load passed. Real public configuration and browser/server
client initialization are verified. The original M01 four-table proposal is superseded
by the three-table decision below. See
`supabase/migrations/20260917000100_operational_model.sql`.

## Tables

| Table | Responsibility | Important columns and constraints |
|---|---|---|
| `jobs` | Source work-order identity, not operational truth | UUID `id`; `source`, `external_id` unique together; source `provenance`, `producer`; database `created_at`. No stage column. |
| `job_claims` | One recorded source assertion about a job | UUID `id`; FK `job_id`; `property`, text `value`; `source`, `source_record_ref`, `property` unique together; provenance/producer; nullable `recorded_at`, `effective_from`; database `created_at`. |
| `events` | Original operational observations | UUID `id`; FK `job_id`; source/external ID unique together; `event_type`; provenance/producer; `time_kind`, `occurred_at_raw`, nullable `occurred_at`; database `ingested_at`. |

Job relationships use foreign keys with restricted deletion. Claim and event
job foreign keys are indexed. Required text is nonempty, trimmed, bounded to
200 characters, and excludes control characters. Source namespaces are bounded
lowercase identifiers. No employee scoring fields, diagnosis enum, intelligence
payload, or generic rules engine exists.

All three tables have RLS enabled and forced, no application policies, and no
privileges for PUBLIC, anon, or authenticated. See security below.

## Identifiers and claims

Internal IDs are deterministic UUIDv8 values: the first 128 bits of SHA-256 over
an unambiguous JSON tuple containing a versioned namespace, record kind,
source namespace, external ID, and (for claims) property. The version/variant
bits are set explicitly. Source strings are retained alongside IDs, so W-1
through W-4, R-1 and E-2 remain directly traceable. Namespaced external IDs
support future integrations with colliding identifiers. No identity depends on
wall-clock time or input field ordering.

Claims preserve exact text, including `receipt_ref = R-1`. The original job ID
is the C02 claim `source_record_ref`; property identifies the field within that
record. Missing fields remain absent; they do not become false or null claims.
A claim is not evidence of operational reality. Future replacement claims must
use a new immutable source record identity/version. Updating an original claim,
even to attach a supersession pointer, is prohibited. Future selection of the
current claim/version needs a separate M03+ decision.

## Occurrence time versus ingestion time

Events use three representations:

- `unknown`: raw time and occurrence timestamp are null.
- `clock`: exact HH:MM or HH:MM:SS text; occurrence timestamp is null.
- `timestamp`: full ISO date/time with Z or an explicit offset; raw source text
  is retained and the occurrence timestamp denotes the same instant.

R-1 stores `clock`, `08:40`, NULL. E-2 stores `clock`, `08:50`, NULL. There is
no invented date, timezone, duration, stage-entry timestamp, or SLA. Claim
recording/effective timestamps are also null for C02. Database creation and
ingestion timestamps describe persistence, never when workshop activity occurred.
Application validation rejects malformed clocks, invalid calendar dates,
year zero, missing offsets, and offset magnitudes greater than 14:00.
SQL constrains representation consistency and timestamp/raw agreement.

## Provenance and immutable persistence

The canonical domain contract still has five provenance values. M02 source
storage permits only SUPPLIED, SYNTHETIC, and INTEGRATION; GENERATED belongs
downstream, and HUMAN_VALIDATED requires a future authorized review boundary.
SUPPLIED source rows use `c02-supplied` / `fixture-loader`. SYNTHETIC rows
require a `synthetic:` namespace; INTEGRATION requires `integration:`. These
SQL metadata checks do not authenticate a producer.

The internal server capability controls permitted provenance. Only the fixture
loader supplies the fixture context. Future synthetic/manual producers supply
synthetic context. A future integration adapter must authenticate the external
system before constructing integration context. No adapter, registration API,
or authentication mechanism is implemented in M02. Context must NEVER be
accepted from untrusted request data. It is a trusted internal interface, not a
proof supplied by the producer.

Database triggers reject all row updates/deletes and table truncation, including
provenance changes. Trusted database administrators can still change schema or
disable triggers; these protections are not a substitute for administrator trust.
The adapter uses ignore-duplicate inserts and compares stored source content
on retry. Identical retries succeed; conflicting reuse raises an error and
retains the original record. It never uses an updating upsert.

## Application ingestion boundary

`src/domain/operational-model.ts` contains framework-independent input types and
strict runtime validators. `src/server/ingestion/events.ts` implements the
shared prepare/persist boundary. These server modules carry Next's `server-only`
marker; Node tests alias the marker to Next's empty server-condition module.
No route, Server Action, UI input, or automatic writer is exposed.

Accepted event fields are `job: { source, external_id }`, `external_id`,
`event_type`, `provenance`, and `time: { kind, raw? }`. Event source and producer
are established by internal context, not by the event body. Validation runs
before database lookup; the boundary resolves the namespaced job and refuses an
unknown/mismatched relationship before persistence. Source IDs/types and temporal
representations are validated. Event types remain source text, not a premature
workshop ontology. Events record observations; they cannot change a job claim
or execute a workflow action.

Unknown fields are rejected at every input object level. This excludes evidence
classification, diagnosis, AI conclusions, priority, human validation,
recommendation results, and arbitrary nested payloads. There is no free-form
JSON payload through which intelligence can be smuggled.

The future simulator will call exactly `ingestEvent` with SYNTHETIC events and
trusted synthetic context. It has no persistence shortcut and cannot use
SUPPLIED, INTEGRATION, or HUMAN_VALIDATED provenance. No simulation mechanism
has been selected or implemented. Approved workflow actions require a future
review/authorization contract before they can enter this boundary. Reevaluation
is deferred to M03; M02 does not produce analyses or classifications.

## Fixture transformation/loading and rules

`src/server/ingestion/c02.ts` reads only the committed C02 fixture, without
modifying it. `transformC02` prepares deterministic jobs/claims/events/rules and
validates fixture events through the shared boundary before any writes.
`loadC02` accepts an injected repository, appends jobs then claims, and sends
events through the same ingestion function used by every future producer.

Logical counts: **4 jobs, 14 claims, 2 events, 3 rules**. Claims are 4 each for
W-1/W-2 and 3 each for W-3/W-4. All imported source rows retain SUPPLIED.
Rules remain verbatim in the fixture and transformation result, available for
later domain logic and citation by RULE 1/2/3. No SQL rules table is justified.

The Supabase adapter takes an injected client and respects its permissions.
No credential-bearing client is constructed. Repeated loading uses the same
identities and cannot create logical duplicates. Loading is sequential, not a
multi-table transaction: interruption can leave partial setup, and retry
resumes safely. The loader must not be run against the remote before approval.
It is not called on build, startup, page rendering, or test network execution.

M02.2 verification confirmed 4 persisted jobs, 14 claims and 2 events, exactly
matching the transformer output. A second load retained every source record and
its creation/ingestion timestamp. All source provenance is SUPPLIED. All three
tables have enabled/forced RLS, zero policies, and no effective privileges for
anon/authenticated/service_role across SELECT/INSERT/UPDATE/DELETE/TRUNCATE.

No authoritative original challenge source is present. Transcription was
compared with the repository brief/documentation only and preserved unchanged.

## Supabase clients, authentication, and security

Existing browser/server public client helpers remain unchanged. They are lazy
and use only public environment variables. Authenticated application sessions
are not needed for M02, so @supabase/ssr, proxy/middleware, and session refresh
are deferred. No duplicate helpers or example todos feature is added.

The migration revokes application table privileges and supplies no policies.
Public clients cannot read or write the operational tables. This follows the
[Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security):
RLS and grants must both be controlled, especially on existing projects with
automatic default grants. No enterprise multi-tenant model is introduced.

A future explicitly approved server writer can use an injected authorized
client after access is reviewed. M02.1 removes the premature service_role
SELECT/INSERT grants: all application/server roles currently have no operational
table privileges or helper-function grants. RLS bypass does not grant table
privileges. No service-role/secret credential is requested, configured, or
exposed. Browser privileges remain denied. Public configuration
belongs only in ignored `.env.local`; `.env.example` stays empty.

The standalone regression under `supabase/tests/` was executed against the
authorized remote PostgreSQL environment via the official CLI Management API
query command. It passed; a follow-up query verified all test records rolled
back before C02 loading. No grants or policies were retained from the tests.
See [the focused M02.1 SQL review](m02-sql-review.md) for the UUID comparison,
complete access matrix, lifecycle/claim evolution notes, and execution limits.

## Deferred to M03+

`analyses` is deferred until M03 produces analysis output. Findings/evidence
storage, diagnosis vocabulary, current-claim selection, deterministic
reconciliation/timing/priority, AI, review decisions, resolutions, proposed
actions, knowledge entries, notifications, authentication and simulation all
remain deferred. RULE 1/2/3 enforcement for downstream proposals/actions is not
implemented prematurely. Further remote schema changes require review and
explicit approval. M02.2 permits commit/push only when all checkpoint gates pass;
no M03 work is authorized.
