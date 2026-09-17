# M06 Human Decision Layer

Status: local hackathon implementation; no commit, push, remote migration or M07.

## What M06 adds

M05 produces a deterministic, grounded investigation plan with a suggested next
verification step and `operationalAction = null`. M06 adds the human control
boundary: an authorized human APPROVES or CORRECTS that generated investigation
path. Approval is NOT resolution and NOT a workflow transition. The deterministic
system never changes workshop operational state on its own.

## Contract

`src/domain/human-decision.ts` defines the framework-independent contract:

- `HumanDecisionType`: `APPROVED` | `CORRECTED`.
- `HumanDecisionInput`: the browser-supplied fields only (`jobId`,
  `investigationPlanId`, `decisionType`, `selectedNextStep`, optional
  `correctionText` / `correctionReason` / `humanEvidenceReference`).
- `HumanDecision`: the persisted record with server-set `reviewer`, `createdAt`,
  `provenance: "HUMAN_VALIDATED"` and derived source references.

Provenance, reviewer, source references and timestamps never appear in the input
schema; the server recomputes or sets them. Validation is strict and
allowlist-based: unknown fields are rejected, correction text is required and
bounded (1000 characters), reason/reference are bounded (200), and C0/C1
controls, DEL and zero-width separators are rejected.

## Plan identity

M05 plans previously had no durable identity. `InvestigationPlan.id` is now a
deterministic UUIDv8 computed by
`src/server/investigation/plan-identity.ts` from the job identity, provider,
provider version and the sorted source claim/event/finding references. It never
depends on wall-clock time, rendering order or input ordering, so a decision can
retain exactly what was reviewed.

## Approval semantics

`APPROVED` means "the human accepts this investigation / next verification step".
It does NOT mean the underlying workshop issue is resolved. Recording an approval:

- persists a new `HUMAN_VALIDATED` record linked to the plan and its sources,
- keeps the evidence gap,
- keeps the recorded stage (`awaiting parts` for W-1) unchanged,
- creates no workshop event and no workflow change,
- keeps `operationalAction` null.

The UI shows "Human reviewed · Investigation path approved", never "resolved".

## Correction semantics

`CORRECTED` means "the human has supplied a correction to the generated
investigation". It is stored as a separate linked record and never retroactively
rewrites the source event (R-1), the M03 finding, or the generated investigation.
The W-1 failure-demo correction ("The scanned item belongs to another work
order.") is preserved as human input for later M09 organizational memory.

## Provenance

Original source records stay `SUPPLIED`. Findings and plans stay `GENERATED`.
A human decision creates a NEW `HUMAN_VALIDATED` record; originals remain
immutable. Only the server review flow creates `HUMAN_VALIDATED` records.

## Persistence

One narrow table `public.human_decisions` (migration
`supabase/migrations/20260917000200_human_decisions.sql`). It stores the decision
identity, the reviewed plan identity, decision type, reviewed next-step text,
optional correction fields, reviewer, provenance, plan version, and the source
finding/claim/event references. `created_at` is database-generated.

The table is append-only (UPDATE/DELETE/TRUNCATE triggers), RLS enabled and
forced, with no policies. `service_role` receives only INSERT and SELECT; browser
roles receive nothing. `jobs`, `job_claims` and `events` grants/RLS are untouched.

## Server write path

`src/server/decision/actions.ts` is a Server Action. It reads the trusted
snapshot, recomputes the deterministic plan, verifies the submitted plan identity
and reviewed next step, then persists via a privileged service-role client
(`src/lib/supabase/admin.ts`). The browser cannot choose provenance, workshop
stage, events or reviewer.

## Authentication limitation

No authenticated user session exists in this prototype. The server pins a single
explicit reviewer, `Prototype reviewer`; it is never taken from browser input and
no real manager identity is claimed. Real authentication is out of scope for M06.

## UI

Inside the existing investigation panel, `src/components/human-review/human-review.tsx`
renders a HUMAN REVIEW section: the suggested next step, Approve / Correct
controls, a compact correction form, and a decision history with persisted
timestamps and provenance. Source, generation and human provenance remain
visually distinct.

## Boundaries

M06 ends at durable human decision capture. It does not implement reevaluation
(M07), organizational memory (M09), or Telegram (M10). No event is manufactured
on approval. Decisions are append-only; a later different decision is a new row.
