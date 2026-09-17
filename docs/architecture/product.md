# Product definition

## Problem

A workshop system records a state for each job: stage, next owner, approvals,
parts. That recorded state can drift from what is actually happening in the
workshop. From the system alone, a manager cannot easily tell which records are
backed by evidence, which are contradicted and which have never been checked.

## What the product is

Workshop Flow Intelligence is an operational intelligence layer that sits above
existing workshop systems. It reads recorded job state and operational events,
reconciles them, and tells the workshop manager, for each job:

- what the recorded system state says
- what the operational evidence says
- whether the two agree
- what evidence is missing
- what should be investigated
- who owns the next step, when that is known
- what evidence-backed action should happen next
- which issues deserve attention first
- how long the job has been in its current state, when timestamps support it
- whether workflow drift may exist
- why the system reached each conclusion ("Show Me Why")

The product does not replace the workshop system, and it is not the system of
record for job status.

## Users

The primary user is the **workshop manager**.

Other workshop roles appear in the data as owners of next steps: parts
coordinator, service adviser, workshop controller and collection desk. They are
roles used to route work. The product does not evaluate the people in them.

## Principles

1. **Recorded state is a claim, not a fact.** A stage of "ready" means the system
   says the job is ready.
2. **Evidence first.** Every conclusion references the records it rests on.
3. **Say what is unknown.** Missing evidence and unavailable timing are shown as
   missing or unavailable. They are never filled in.
4. **Deterministic before generative.** Facts that can be computed are computed.
   The AI layer explains, reasons about ambiguous evidence and proposes actions.
   It does not establish facts.
5. **Humans stay in control.** The system proposes, and a human approves every
   state-changing action.
6. **Learn from corrections carefully.** A human correction never silently
   rewrites global rules. Knowledge derived from a resolution keeps its
   provenance.
7. **No scoring of people.** The product never produces employee performance
   scores (supplied RULE 2).
8. **An honest demo.** Synthetic data is labelled. An integration that did not
   happen is never shown as successful.

## Case analysis

For each job, a case analysis should eventually expose the elements below. The
"Produced by" column follows the layer boundaries in
[architecture.md](architecture.md).

| Element | Produced by |
|---|---|
| Recorded state | Source data |
| Relevant claims | Deterministic engine |
| Supporting and conflicting evidence | Deterministic engine |
| Evidence classification | Deterministic engine. AI commentary on ambiguous evidence is kept separate and does not override it. |
| Operational diagnosis | Deterministic rules, plus AI reasoning labelled as generated |
| Missing information | Deterministic engine |
| Investigation target | AI guidance grounded in the deterministic findings |
| Known owner | Source data |
| Time in stage and workflow drift | Deterministic engine, only when timestamps support it |
| Priority factors | Deterministic engine, with every factor visible |
| Proposed next action | Rules or AI, subject to RULE 1 and human approval |
| Provenance ("Show Me Why") | Deterministic trail of inputs, rules and producers |

## Capabilities after M01

The architecture must not block the capabilities below. None of them is
implemented in M01, and their order is decided milestone by milestone. So far,
M02 is the domain model and M03 is deterministic tests against the C02 fixture.

- Evidence reconciliation and missing-evidence detection
- AI investigation, explanation and investigation guidance
- View Evidence / Show Me Why
- Proposed actions and transparent prioritization
- Time in stage, workflow drift and a synthetic SLA demonstration
- Human approval, AI correction, resolution capture and human validation
- An operational knowledge base, including retrieval of similar validated incidents
- Event-driven reevaluation and meaningful notifications, including Telegram delivery
- A live demo simulation (constrained by [simulation-contract.md](simulation-contract.md))

## Non-goals

- Replacing the workshop management system
- Changing workflow status on its own
- Scoring or ranking employees
- Presenting synthetic data or simulated integrations as real
- Inferring durations, SLAs or clock times that the data does not contain
