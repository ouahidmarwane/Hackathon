# Canonical terminology

Use these terms in code, UI text and documentation. Uppercase identifiers are
**contract values**: code must use exactly these strings.

## Contract values (stable from M01)

### EvidenceClassification

This answers one question: does the evidence back the claim?

| Value | Meaning |
|---|---|
| `SUPPORTED` | The evidence is consistent with the claim and sufficient to back it. |
| `CONFLICTING_EVIDENCE` | At least one piece of evidence contradicts the claim, or pieces of evidence contradict each other. |
| `INSUFFICIENT_EVIDENCE` | Nothing contradicts the claim, but the available evidence is not enough to back it. |

- A classification applies to a single claim, not to a whole job. One job can
  have claims with different classifications.
- Missing evidence is not a contradiction. A claim with no related evidence is
  `INSUFFICIENT_EVIDENCE`, not `CONFLICTING_EVIDENCE`.
- Proposed precedence, to confirm in M03: a claim that has both a contradiction
  and missing evidence is `CONFLICTING_EVIDENCE`, and the missing evidence is
  still listed.

### DataProvenance

`SUPPLIED`, `SYNTHETIC`, `INTEGRATION`, `GENERATED`, `HUMAN_VALIDATED`. They
are defined in [data-provenance.md](data-provenance.md).

Both contracts are implemented in `src/domain/contracts.ts`
(`EVIDENCE_CLASSIFICATIONS`, `DATA_PROVENANCE`). That module and this page must
stay in sync.

## A separate dimension: operational diagnosis

A diagnosis answers a different question: what does this mean operationally? It
is independent of evidence classification. For example, a recorded "paused"
state can be fully `SUPPORTED` and still be a blocker.

Candidate values are listed below. They are **not a contract yet**. Do not add
them to code as a fixed enum until a milestone's requirements justify the final
list.

| Candidate | Meaning |
|---|---|
| `BLOCKER` | Progress is prevented by an identified cause. |
| `POSSIBLE_STALE_STATE` | The recorded state may no longer reflect reality. |
| `INVESTIGATION_REQUIRED` | A person must check something before anything else can be concluded. |
| `NO_ACTION_REQUIRED` | Nothing needs attention now. |

## Human review decisions

The only decisions described so far are `APPROVE` and `CORRECT`. It is still
open whether a separate reject or dismiss decision is needed (see
[domain-model.md](domain-model.md)).

## Terms

| Term | Meaning |
|---|---|
| Job | A workshop work order (W-1 to W-4 in C02). |
| Recorded state | What the workshop system says about a job: stage, next owner, approvals, parts, device state. It is not the same as a verified state. |
| Stage | The recorded workflow stage field, for example "awaiting parts". |
| Claim | One assertion about a job that can be checked against evidence. Each recorded field is a claim. |
| Event | Something recorded as having happened, with its own ID (R-1, E-2). An event shows only what it says: a "part scan" is a scan, not delivery of the part to a technician. |
| Evidence | An event or record cited for or against a claim, together with its stance (supports or conflicts). Evidence is a relationship between records, not a separate kind of data. |
| Source record | The record that a finding or recommendation can be traced back to (RULE 1). |
| Analysis | The output of one evaluation of a job at a point in time: claims, evidence, classifications, diagnosis, missing information, owner, timing, priority factors and proposed actions. Analyses never change after creation. Reevaluation produces a new analysis. |
| Finding | One conclusion within an analysis, with references to its evidence. |
| Missing information | Evidence that is not present and would be needed either to classify a claim as `SUPPORTED` or to resolve a conflict. |
| Investigation target | The specific thing a person should check, and where or with whom, to resolve missing or conflicting evidence. |
| Known owner | The role recorded as owning the next step (`next_owner`). "Known" means recorded. An owner that is not recorded is shown as unknown. |
| Proposed action | An action suggested by the system. Nothing happens until a human approves it. An approved state-changing action runs only on the server. |
| Task recommendation | A proposed action assigned to an owner. It requires a source record and an owner (RULE 1). |
| Human review | A person's decision (`APPROVE` or `CORRECT`) on a finding or a proposed action, with a reason. |
| Resolution | What actually happened, or what resolved the case, as recorded by a human. |
| Operational knowledge (knowledge entry) | A reusable lesson derived from a resolution and validated by a human. It keeps provenance back to its case and never silently changes global rules. |
| Time in stage | How long a job has been in its current stage. It can be calculated only when both a stage-entry timestamp and the current time are known. Otherwise it is reported as unavailable. |
| Workflow drift | A gap between how a job is expected to move through the workflow and how it is recorded as moving. It is asserted only when evidence and timing support it. Otherwise it is reported as possible drift, with the missing information listed. |
| SLA | A time expectation for a stage. C02 supplies none. Any SLA used in the prototype is `SYNTHETIC` and labelled as such. |
| Priority factors | The named, visible inputs used to order issues. They describe jobs, never people. |
| Show Me Why | The trail behind a conclusion: which records and rules it used, which layer produced it, and the provenance of each. |
| Reevaluation | Running the analysis of a job again because a relevant event was ingested. |
| Meaningful notification | A notification sent because an analysis changed in a way that a role needs to act on. Events alone do not trigger notifications. |
| Event producer | Anything that submits events through the ingestion interface: the fixture loader, manual entry, an integration, the simulator or an approved action. |
| Supplied rule | RULE 1, RULE 2 or RULE 3 from C02. The supplied rules are enforced deterministically and cited by `rule_id`. |

## Wording to avoid

| Avoid | Why | Say instead |
|---|---|---|
| "verified" for a recorded state | Recorded does not mean verified | "recorded as ready" |
| "sent" or "answered" for E-2 | E-2 says only that an approval request was prepared | "approval request prepared" |
| "part delivered to technician" based on R-1 | R-1 is a scan | "part scan recorded" |
| "overdue" or "SLA breach" | No SLA or current time is supplied | "time in stage unavailable", or a clearly labelled `SYNTHETIC` SLA |
| "performance" or "slow technician" | RULE 2 | Describe the job, not the person |
