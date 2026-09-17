# M03 deterministic evidence engine

Status: local implementation for architecture review. No commit, deployment,
source mutation, UI, AI or simulation is part of this pass.

## Boundary and persistence decision

`src/domain/evidence-engine.ts` exports synchronous, pure `evaluateEvidence`.
It consumes readonly normalized M02 claims/events and optional trusted scoped
device links, and returns one finding per claim. It imports only domain modules.
There is no database client, server service, endpoint, credential, network,
wall-clock access, or automatic ingestion-triggered reevaluation.

Findings remain **computed in memory**. Show Me Why works through source IDs,
stance IDs, missing requirements and rule codes without an LLM. Immutable M02
source snapshots and a retained rule version permit reproducibility for this
prototype. Current requirements do not need persisted finding history, so no
table or migration is created. Durable audits, reviewed finding references,
event-driven historical comparisons and human decisions will require a reviewed
snapshot/history design before deployment; this implementation does not promise
durable historical replay by version string alone. Old rule code must be retained
to replay old versions.

## Finding contract

| Field | Meaning |
|---|---|
| `id` | `finding:` plus canonical JSON of the logical finding. A transparent, unambiguous logical key, not a database UUID or authorization token. |
| `job_id` | Source job identity. |
| `subject` | Evaluated claim ID, exact property and exact value. |
| `classification` | Existing canonical evidence classification. |
| `source_claim_ids` | Evaluated claim and any receipt-reference claims used by its rule. |
| `related_event_ids` | Relevant events, including contextual events that establish neither support nor conflict. |
| `supporting_event_ids` | Events whose scoped semantics directly support the evaluated assertion. |
| `conflicting_event_ids` | Events whose scoped semantics are explicitly incompatible with the assertion. |
| `missing_evidence` | Sorted stable requirement codes scoped to the subject claim/job. |
| `rule_code`, `rule_version` | Inspectable rule and `evidence-engine/c02/v1`. |
| `provenance`, `producer` | `GENERATED`, `deterministic-evidence-engine`. |
| `depends_on_synthetic` | True when a cited claim or related event is SYNTHETIC. |

No diagnosis, score, confidence, generated timestamp, priority, recommendation,
employee judgment or job-wide evidence classification is emitted. Ownership
remains the recorded `next_owner` subject, never causal responsibility. IDs can
be long because they encode logical content; persistence will require a reviewed
compact identifier/indexing decision rather than assuming M02's UUID contract.

## Exact evidence semantics

- **SUPPORTED**: at least one rule-authorized observation or explicit reference
  relationship directly supports this exact assertion, with no rule-authorized
  incompatible observation. Supporting a reference verifies that relationship,
  not the operational state of a vehicle, required part or technician.
- **CONFLICTING_EVIDENCE**: at least one explicitly scoped observation states a
  value incompatible with the evaluated assertion. Supporting observations are
  retained alongside conflicts. It does not select which record is true/current.
- **INSUFFICIENT_EVIDENCE**: no implemented rule can establish direct support or
  incompatibility for the assertion. Context, absent records and other recorded
  claims do not independently verify it. This is not a diagnosis of delay or
  blockage, nor an assertion that a missing event never occurred.

## Rules and links

The exported `EVIDENCE_RULES` registry explains every rule code. There is no
generic enterprise rule language. Matching is exact and case-sensitive; source
text is never silently rewritten. Unknown properties use `CLAIM_GAP`.

| Rule | Deterministic behavior |
|---|---|
| `RECEIPT_REFERENCE` | `receipt_ref` exactly matches the external ID of a `part scan` event in the same job/source namespace. Support verifies the reference only. |
| `PART_RECEIPT` | R-1 is related through the single receipt_ref in the same original source record. A scan cannot verify receipt of the required part. |
| `PART_HANDOFF_GAP` | Awaiting-parts claim cites the linked scan as context and requests stage/handoff verification. It does not conclude staleness. |
| `APPROVAL_GAP` | Same-job/source `approval request prepared` is context only; dispatch and approval state remain unverified. |
| `QUALITY_CHECK_GAP` | Recorded quality check does not establish progress, regardless of a recorded offline device. |
| `READINESS_GAP` | Recorded ready requires independent readiness verification. |
| `CLAIM_GAP` | Default unverified assertion with a property-specific requirement where known. Prepared requests may contextualize repair paused without proving its cause. |
| `DEVICE_OBSERVATION` | Explicit same-device/same-assertion links permit exact online/offline comparisons; incompatible observations take precedence, retaining both stances. |

Receipt linking requires job ID, namespace, reference value and known event type,
never fuzzy similarity. Dependencies are limited to the same original claim
source record. Multiple receipt_ref claims are retained but no arbitrary reference
is chosen for stage/receipt reconciliation. A reference with no matching scan is
insufficient, not conflicting. Other source namespaces and jobs cannot supply
matching evidence merely because their external IDs collide.

`device_links` are **trusted normalization assertions**, not persisted source
records, proof of authority, or an untrusted request contract. Each link specifies
claim ID, event ID and `scope = same-device-same-assertion`. Only `device_state`
online/offline claims and exact `device state confirmed: online/offline` event
types are accepted. Same job/source is enforced, dangling/incompatible links fail.
A future authenticated adapter must establish device identity, authority and the
same assertion's temporal scope before creating such a link. The label alone
cannot establish those facts. No adapter or new production producer is exposed;
direct observation cases currently exist only in SYNTHETIC unit-test fixtures.
These comparisons concern an explicitly scoped assertion, not a latest/current
state calculation. An unlinked device event remains unevaluated context.

## Missing evidence taxonomy

Codes express verification requirements, not generated tasks or proof of absence.
They are scoped by the finding's claim/job; no employee is assigned blame.

| Code | Required information |
|---|---|
| `PART_TO_JOB_HANDOFF_CONFIRMATION` | Required part reached this job or technician. |
| `PART_RECEIPT_CONFIRMATION` | Receipt of the required part for this job, beyond an unspecified scan. |
| `RECEIPT_REFERENCE_RESOLUTION` | An unambiguous reference to a same-job/source part-scan event. |
| `APPROVAL_REQUEST_DISPATCH_CONFIRMATION` | Prepared request was dispatched; does not by itself prove receipt/response. |
| `CUSTOMER_APPROVAL_RESPONSE` | Authoritative customer approval outcome/state for the assertion. |
| `QUALITY_CHECK_PROGRESS_CONFIRMATION` | Independent quality-check state/progress verification. |
| `OPERATIONAL_READINESS_CONFIRMATION` | Independent verification of readiness for this job. |
| `STAGE_CONFIRMATION` | Independent confirmation of the recorded stage. |
| `DEVICE_STATE_CONFIRMATION` | Same-device/same-assertion authoritative state observation. |
| `PART_REQUIREMENT_CONFIRMATION` | Independent verification that a part is/is not required. |
| `OWNER_ASSIGNMENT_CONFIRMATION` | Independent verification of the recorded assignment; no performance judgment. |
| `CLAIM_VERIFICATION` | No specialized verification rule exists; an authoritative scoped verification is needed. |

These requirements describe gaps; M03 does not implement future confirmation
event semantics except the explicit device comparison. Supplying arbitrary event
text with the name of a requirement will not automatically resolve a finding.

## Supplied C02 results

All rows also cite the evaluated claim ID. R-1/E-2 below mean related events;
only the receipt_ref row treats R-1 as supporting. No C02 row has conflict IDs.

| Job | Recorded claim | State | Related event | Missing evidence | Rule |
|---|---|---|---|---|---|
| W-1 | stage = awaiting parts | INSUFFICIENT_EVIDENCE | R-1 via receipt_ref | STAGE_CONFIRMATION; PART_TO_JOB_HANDOFF_CONFIRMATION | PART_HANDOFF_GAP |
| W-1 | part_receipt = received | INSUFFICIENT_EVIDENCE | R-1 via receipt_ref | PART_RECEIPT_CONFIRMATION | PART_RECEIPT |
| W-1 | receipt_ref = R-1 | SUPPORTED | R-1, supporting reference | none | RECEIPT_REFERENCE |
| W-1 | next_owner = parts coordinator | INSUFFICIENT_EVIDENCE | none | OWNER_ASSIGNMENT_CONFIRMATION | CLAIM_GAP |
| W-2 | stage = repair paused | INSUFFICIENT_EVIDENCE | E-2, context | STAGE_CONFIRMATION | CLAIM_GAP |
| W-2 | part = not required | INSUFFICIENT_EVIDENCE | none | PART_REQUIREMENT_CONFIRMATION | CLAIM_GAP |
| W-2 | customer_approval = missing | INSUFFICIENT_EVIDENCE | E-2, context | APPROVAL_REQUEST_DISPATCH_CONFIRMATION; CUSTOMER_APPROVAL_RESPONSE | APPROVAL_GAP |
| W-2 | next_owner = service adviser | INSUFFICIENT_EVIDENCE | none | OWNER_ASSIGNMENT_CONFIRMATION | CLAIM_GAP |
| W-3 | stage = quality check | INSUFFICIENT_EVIDENCE | none | QUALITY_CHECK_PROGRESS_CONFIRMATION | QUALITY_CHECK_GAP |
| W-3 | device_state = offline | INSUFFICIENT_EVIDENCE | none | DEVICE_STATE_CONFIRMATION | CLAIM_GAP |
| W-3 | next_owner = workshop controller | INSUFFICIENT_EVIDENCE | none | OWNER_ASSIGNMENT_CONFIRMATION | CLAIM_GAP |
| W-4 | stage = ready | INSUFFICIENT_EVIDENCE | none | OPERATIONAL_READINESS_CONFIRMATION | READINESS_GAP |
| W-4 | customer_approval = received | INSUFFICIENT_EVIDENCE | none | CUSTOMER_APPROVAL_RESPONSE | APPROVAL_GAP |
| W-4 | next_owner = collection desk | INSUFFICIENT_EVIDENCE | none | OWNER_ASSIGNMENT_CONFIRMATION | CLAIM_GAP |

W-1 does not establish staleness, goods-in receipt of the required part, handoff,
ability to resume repair or coordinator failure. This deliberately takes the
conservative interpretation of `part_receipt`; a scan supports only the explicit
reference. Architecture review may refine receipt semantics with authoritative
source information and a new rule version.

W-2 establishes preparation only, never sending, delivery, response, rejection,
customer delay or adviser failure. W-3 establishes recorded fields only, never
blockage, progress, device causation or controller responsibility. W-4 is not a
verified normal case. There is no invented completion or synthetic control event.

R-1 remains clock / 08:40 / NULL; E-2 remains clock / 08:50 / NULL. No date,
timezone, duration, current time, SLA or ingestion timestamp establishes progress.

## Determinism, validation and limitations

Findings sort by source claim ID; every dependency/stance/requirement list is
deduplicated and sorted by JavaScript's ordinal string order. Input permutations,
cloned/frozen snapshots and duplicate identical device links yield identical
output/identities. Finding identity includes the complete logical result, subject,
version and cited dependencies; changed conclusions/dependencies yield a new key.
No generated_at is emitted. Source identity is assumed immutable as in M02;
changed content under an existing source ID must not be accepted by a loader.

The typed domain API expects normalized M02 records. It rejects duplicate IDs,
ambiguous namespaced event identities, non-source provenance, invalid event time
representations and invalid direct links. It is not a full request/authentication
boundary or a substitute for M02's ingestion/SQL constraints. Findings never feed
back as source evidence. HUMAN_VALIDATED inputs await a reviewed source contract.
No current-claim selection, supersession, historical chronology, generic ontology,
cross-source joins or job-level aggregation is implemented.

Tests cover all 14 C02 findings, stable output/identities, unchanged source
provenance, frozen inputs, no clock/network usage, explicit test-only support and
conflict, mixed stances, invalid links, reference isolation, ambiguous references,
missing fields, unknown properties and rejected derived input.

M04+ owns presentation/Show Me Why navigation. Later work owns secure loading,
event-driven reevaluation, durable history, diagnoses, actions/review, timing,
simulation and notifications. AI may later explain grounded findings and propose
investigation guidance; it cannot override classifications, invent evidence,
assign blame or write source state. Supplied RULE 1/3 action enforcement remains
downstream; M03 emits no tasks/actions and respects RULE 2 by emitting no scores.
