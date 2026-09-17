# Architecture boundaries

Status: M01 contract, with the stack added in M01.5. This page defines
responsibilities and boundaries. The [Stack](#stack) section maps them onto
code.

## Layers

```text
DATA / EVENTS
    |
DETERMINISTIC EVIDENCE & RECONCILIATION ENGINE
    |
AI REASONING LAYER
    |
HUMAN DECISION LAYER
    |
APPLICATION / CONTROL TOWER
```

Each layer reads the output of the layers above it and never writes into them
directly. The only way to change data is to submit a new event through the
ingestion interface (see [Single ingestion path](#single-ingestion-path)).

| Layer | Owns | Must not |
|---|---|---|
| Data / events | Jobs, recorded claims, events and their provenance. A single validated ingestion interface. | Accept derived values as input: evidence classifications, diagnoses, AI output or review decisions. |
| Deterministic engine | Source relationships, presence or absence of evidence, deterministic contradictions, enforcement of the supplied rules, timestamp arithmetic (only when timestamps exist), known owner, authorization constraints, evidence classification, missing information, priority factors | Call an LLM. Invent timestamps, durations or SLAs. |
| AI reasoning | Grounded explanations, reasoning about ambiguous evidence, investigation guidance, proposed actions, summaries, retrieval of validated knowledge | Override deterministic results. Cite anything other than existing records. Write state. |
| Human decision | APPROVE or CORRECT on findings and proposed actions. Reasons and actual resolutions. Validation of knowledge. | Change global rules as a side effect of a correction. |
| Application / control tower | Presentation, Show Me Why, the prioritized queue, the review UI, notification settings | Compute or fake intelligence in the client. Hold privileged credentials. |

## Deterministic vs AI boundary

1. Deterministic output is computed from records and is reproducible: the same
   inputs and engine version always give the same output. It can be tested
   against the C02 fixture without a model or network access.
2. AI output is stored and displayed separately from deterministic output. It is
   labelled `GENERATED`, along with the model that produced it.
3. AI output may reference only records that exist: event IDs, claim IDs and rule
   IDs. References are checked before display. A statement with no valid
   reference is rejected or shown as unsupported.
4. AI output never changes a deterministic result, including an evidence
   classification. When AI reasoning disagrees with a deterministic result, both
   are shown, and the disagreement becomes a reason to investigate.
5. The product still works without the AI layer. Deterministic findings,
   missing evidence and owners are shown even when no model is available.
6. Actions proposed by the AI layer go through the same deterministic checks as
   any other proposal: RULE 1 and authorization.

## Single ingestion path

Every input enters through one validated event ingestion interface:

- loading of the supplied C02 fixture
- manual entry
- future integrations with workshop systems
- the future demo simulator ([simulation-contract.md](simulation-contract.md))
- execution of approved actions (see below)

The interface validates the schema, the provenance and the references, appends
the records, and triggers reevaluation of the affected jobs. No other component
writes jobs, claims or events.

```text
producer (fixture loader | manual entry | integration | simulator | approved action)
  -> ingestion interface: validate, check provenance, append
  -> reevaluation of affected jobs
  -> deterministic engine -> AI layer -> new analysis
  -> control tower and notifications
```

## Human approval boundary

- The system may propose any action. It executes no action that changes workflow
  state without approval.
- Writing or updating workflow status requires reviewer approval (supplied
  RULE 3). The flow is:
  1. A proposed action describes the exact change.
  2. A reviewer records an APPROVE decision.
  3. Server-side code checks three things: the approval exists, it refers to
     that exact proposed change, and the reviewer is authorized.
  4. The change is recorded as a new event through the ingestion interface. The
     event references the proposed action and the review.
- A CORRECT decision records the reviewer's reason and the actual resolution. It
  never changes engine rules. Turning a resolution into reusable knowledge is a
  separate, explicit validation step by a human.
- Task recommendations require a source record and an owner (supplied RULE 1).
  If a recommendation lacks either, it is not shown as a task. The gap is shown
  as missing information instead.
- No component computes, stores or displays employee performance scores
  (supplied RULE 2). Owners are roles, used to route work, never to rank people.
  Priority factors describe jobs, not people.
- Approval checks are enforced on the server. Any checks in the client are for
  convenience only.

## Security baseline

- Privileged credentials exist only in server-side environments. These include
  the database service-role key, the AI provider key and the Telegram bot token.
  They are never bundled into client code or committed. They never get a prefix
  that exposes them to the client, such as `NEXT_PUBLIC_` or `VITE_`.
- The client uses only the public Supabase key (the publishable key, or the
  legacy anon key). Row-level security limits what the client can read and
  write in the database. `src/lib/supabase/config.ts` refuses to start if a
  secret or service_role key is placed in the public variable.
- Status writes, execution of approved actions, notification delivery and AI
  calls all run on the server.
- Local environment files are git-ignored. A committed `.env.example` lists
  variable names only, with no values.
- Fixtures contain roles, not people. Any synthetic names, phone numbers or chat
  IDs must be obviously fictional.
- Notifications carry only what the receiving role needs. They never carry
  anything that scores employees.

## Stack

Decided in M01.5: Git, Next.js (App Router), TypeScript, Tailwind CSS,
Supabase and Vitest.

| Path | Holds | Rule |
|---|---|---|
| `src/app/` | Next.js routes and layouts | Presentation only. |
| `src/components/` | UI components (created when first needed) | Presentation only. |
| `src/domain/` | Contract values, and later the deterministic engine | No imports from Next.js, React, Supabase or other app folders. ESLint enforces this. |
| `src/lib/supabase/` | Supabase client setup | Uses the public key only. No privileged client exists yet. |
| `src/server/` | Server-only application services, such as ingestion and approved-action execution (created when first needed) | Runs on the server only. |
| `supabase/migrations/` | Database migrations (created in M02) | Local only until explicitly approved. |
| `fixtures/` | Supplied data, and later synthetic data | Read-only in tests. |
| `tests/` | Vitest tests | Run with no network or model access. |

The requirements that led to this choice still apply:

- a server-side environment for privileged operations
- one place to implement the ingestion interface
- a test runner that can run the deterministic engine against
  `fixtures/c02/` without network or model access
- a single shared module for the contract values in [glossary.md](glossary.md):
  `src/domain/contracts.ts`
