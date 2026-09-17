# M02.1 SQL hardening review

Status: reviewed SQL applied under M02.2 authorization. The PostgreSQL regression
was executed successfully against the existing remote project; subsequent
verification confirmed rollback before C02 loading. The M02.1 environment
snapshot below is historical. Real public configuration and browser/server client
initialization are verified for the final M02 checkpoint.

## UUID decision: RETAINED

Generation occurs only in TypeScript, in `src/server/ingestion/identity.ts`.
Node's built-in crypto module hashes JSON.stringify of:

`["workshop-source-v1", recordKind, sourceNamespace, externalId, ...keyParts]`

The first 16 SHA-256 bytes are taken; version bits are set to 8 and the variant
bits to binary 10. Claims add property to their original source record key.
The result is the standard 8-4-4-4-12 UUID hexadecimal representation with
122 hash-derived bits after the six fixed bits. UUIDv8 permits a custom layout;
this hash derivation is application-defined, not a standardized name-based
algorithm like UUIDv5. See [RFC 9562 section 5.8](https://www.rfc-editor.org/rfc/rfc9562.html#section-5.8).
PostgreSQL stores supplied UUIDs; it does not generate or recompute these IDs.
No UUID extension is needed by the migration. SQL regression probes use
PostgreSQL's [built-in gen_random_uuid](https://www.postgresql.org/docs/15/functions-uuid.html)
for isolated test rows only, not as an alternative production identity scheme.

| Option | Benefit | Cost for this implementation |
|---|---|---|
| A: random UUID + natural uniqueness | Conventional PK generation; natural keys can provide logical idempotency | Loader must resolve stored job IDs before preparing linked records; adapter must retrieve existing records by natural keys on retries instead of comparing its stable PKs. Offline transformation must distinguish proposed random IDs from persisted IDs. |
| B: deterministic UUIDv8 + natural uniqueness | Same job/claim/event PKs can be prepared offline on every run; relationships exist before database access; current append adapter detects source-content conflicts on retry | One small, custom identity function that must remain versioned/stable; hash collisions are possible in principle. |

Retain B for these concrete loader/retry benefits, not for integration
authentication or security. Natural uniqueness remains the database guarantee
against logical duplicates. Hash collision risk follows a 122-bit birthday
bound (approximately n(n-1)/2^123); a PK collision with different source data
fails verification rather than silently rewriting an original. UUIDs are not
secrets or authorization tokens.

Identity excludes mutable claim values, event type/time, provenance, producer,
owner and persistence timestamps. Source namespace, external/source record ID,
and claim property are identity keys; changing them intentionally creates a
different identity. Identical imports are no-ops. Corrected content under the
same keys is rejected and the original retained. Authoritative C02 correction
must be explicitly reviewed; the current loader never rewrites supplied data.
Future corrections require a new source record/version and a link to the
original, through a reviewed contract/migration. None is implemented here.

## Migration review

The migration uses PostgreSQL UUID/text/enum/timestamptz types, SQL/PLpgSQL,
CHECK/UNIQUE/FK constraints, btree indexes, standard triggers, RLS and REVOKE.
No extension, SECURITY DEFINER function, public write RPC, or SQL UUID
generation is required. Supabase's existing anon/authenticated/service_role
roles are assumed. A plain disposable PostgreSQL environment must provision
equivalent roles locally before executing this Supabase-specific migration.

Every PK is supplied by the caller. Natural keys are unique independently of
PKs. Both job foreign keys restrict deletion and have supporting indexes.
CHECK expressions use required NOT NULL columns or explicit null checks so
SQL CHECK's acceptance of UNKNOWN cannot admit invalid temporal combinations.
Timestamp parsing may raise a PostgreSQL datetime error for malformed raw data;
rejection is intended and no row is persisted. Helpers use an empty explicit
search_path and built-in operations. Source/raw-time control characters are
explicitly excluded.

Hardening changes:

- Block TRUNCATE using BEFORE TRUNCATE statement triggers on every source table.
- Revoke premature service_role table/helper grants; no M02 writer exists.
- Explicitly reject control characters in source namespaces and raw event time.
- Align the application clock validator, which otherwise allowed a final newline.
- Expand independent constraint, mutation, privilege and RLS regression coverage.

The migration is a one-time initial migration, not an idempotent SQL setup
script. Supabase's migration ledger must prevent reapplication. Reapplying it
directly should fail on existing objects rather than mask schema drift with
IF NOT EXISTS. Fixture idempotency is separate: ignore-duplicate INSERT plus
stored-content verification. Tests must use a fresh, disposable local database.

## Access matrix

For all operations below, table privilege is NONE. There are no RLS policies.

| Role | Table | SELECT | INSERT | UPDATE | DELETE | RLS behavior |
|---|---|---|---|---|---|---|
| anon | jobs | Denied | Denied | Denied | Denied | Default deny |
| anon | job_claims | Denied | Denied | Denied | Denied | Default deny |
| anon | events | Denied | Denied | Denied | Denied | Default deny |
| authenticated | jobs | Denied | Denied | Denied | Denied | Default deny |
| authenticated | job_claims | Denied | Denied | Denied | Denied | Default deny |
| authenticated | events | Denied | Denied | Denied | Denied | Default deny |
| service_role | jobs | Denied | Denied | Denied | Denied | BYPASSRLS does not supply privileges |
| service_role | job_claims | Denied | Denied | Denied | Denied | BYPASSRLS does not supply privileges |
| service_role | events | Denied | Denied | Denied | Denied | BYPASSRLS does not supply privileges |

TRUNCATE privileges are also revoked. Effective role membership/inherited grants
must be checked in the target environment, not inferred solely from SQL text.
The regression checks has_table_privilege and actual statements under each role.

A trusted local superuser / administrator with BYPASSRLS and table privileges
can SELECT and INSERT constraint-valid rows. UPDATE/DELETE of existing rows and
TRUNCATE still hit immutable-source triggers. An administrator capable of
disabling triggers or altering/dropping tables is outside this protection.

RLS is enabled and forced on all tables. For non-bypass roles, a temporary
SELECT grant alone exposes no rows; an INSERT grant alone cannot admit a row
without an applicable INSERT policy. UPDATE/DELETE without policies affect
zero rows. These are [PostgreSQL's default-deny semantics](https://www.postgresql.org/docs/current/ddl-rowsecurity.html),
not behavior granted by this application. Test-only grants isolate those
semantics, are rolled back, and are never added to the migration.

## Source immutability and lifecycle

Original source assertions and observations remain immutable. Corrective input
will be a new record with an explicit original-record link, source identity,
provenance, producer and genuine temporal metadata. A future schema extension
will define correction links/current-version selection and any human approval
references. This does not require weakening immutable-source triggers.
Operational lifecycle state, reviews, analysis results and job archival belong
in separately reviewed records/contracts; freezing source tables does not
freeze every future application table. No correction feature is implemented.

C02 claim values are all text and fit the current model exactly. Future typed
integrations can add a versioned value representation (for example value_kind
and a constrained typed/jsonb value) while retaining original text and source
identity. Existing text rows migrate as text, not through inferred casts.
New numeric/boolean/timestamp/structured records require explicit producer
validation, constraints and an intelligence-field allowlist. No typed ontology
or structured payload is introduced now.

## Event time and regression coverage

Clock inputs preserve exact `08:40`/`08:50` text and require NULL occurrence
timestamps. Unknown inputs require both raw and occurrence time NULL.
Timestamp inputs require a date, explicit offset, non-null occurrence timestamp,
and raw/timestamp agreement. Malformed clocks, controls, missing values,
invented timestamps for clocks, mismatched instants and invalid dates are denied.

TEST DEFINED in `supabase/tests/operational_model.sql`:

- 4 jobs, 14 exact supplied claims, 2 original clock-only events.
- Invalid/downstream provenance and provenance/source metadata spoofing.
- Natural-key duplicates on each table with a different UUID.
- Both job foreign keys.
- UPDATE, no-op UPDATE, DELETE and TRUNCATE on every source table.
- Invalid temporal combinations plus valid unknown/explicit-offset time.
- Catalog checks for effective privileges, enabled/forced RLS, absent policies.
- Actual SELECT/INSERT/UPDATE/DELETE denial for all three application/server roles.
- With rollback-only test grants: hidden rows, zero-row updates/deletes, and
  rejected inserts for anon/authenticated without policies.

TEST ACTUALLY EXECUTED: YES, under M02.2 authorization via the official CLI
linked Management API SQL query command. Migration execution: YES. Both returned
exit 0. Follow-up counts were zero after regression, proving test data rolled
back; C02 was then loaded and verified. The regression uses no pgTAP. Its
test-only grants, mutations and synthetic probes are confined to the rollback
transaction. A local execution path remains unavailable; remote execution was
explicitly authorized after architecture review.

## M02.1 environment snapshot and public configuration

No psql/postgres command, Windows PostgreSQL service, or conventional PostgreSQL
installation directory was found. Supabase CLI is not installed and the offline
npx probe found no cached CLI. Docker executable is installed but its Linux
engine pipe is unavailable. No system software or scripts were installed/run
to compensate. A running approved local PostgreSQL/Supabase environment and
client are missing; SQL execution remains blocked.

M02.2 preparation: the official CLI is now pinned to 2.117.0 as a project
dependency, installed with all lifecycle scripts disabled and no existing
dependency upgrades. It provides linked SQL queries through the Management API.
Local CLI configuration disables automatic seeding; temporary state is ignored.
Authentication, linking, clear remote preflight and the one-migration dry-run
completed in M02.2 before authorized deployment. Migration history now matches
the local migration. Remote source counts are 4 jobs, 14 claims and 2 events;
the second load left source and persistence metadata unchanged.

Final M02 checkpoint: the user populated the ignored `.env.local` with the
existing project's public URL and publishable key. The existing configuration
validator accepts it, and browser/server helpers initialize successfully without
database queries. No real configuration values appear in tracked or stageable
content. The official pinned CLI is retained for reproducible development.
No private credential, authentication middleware, RLS change or M03 work is added.
