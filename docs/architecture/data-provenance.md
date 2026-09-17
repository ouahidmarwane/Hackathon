# Data provenance

Every record in the product states where it came from. This page defines the
five provenance values and the policy that separates supplied data from
synthetic data.

The values are defined in code in `src/domain/contracts.ts`
(`DATA_PROVENANCE`), which must stay in sync with this page.

## Categories

| Value | Meaning | Examples | Created only by |
|---|---|---|---|
| `SUPPLIED` | Comes from the official challenge or source dataset. | W-1 to W-4, R-1, E-2, RULE 1 to RULE 3 | The fixture loader, reading `fixtures/c02/` |
| `SYNTHETIC` | Deliberately created as prototype or demo data. | An extra demo job, a synthetic SLA, a demo stage-entry timestamp, simulator events | Team-written fixtures, manual demo entry, the simulator |
| `INTEGRATION` | Received from a real external workshop system, device or API. | A status record from a real workshop management system, a real device heartbeat | An authenticated integration adapter for a registered external system |
| `GENERATED` | Output derived by the deterministic engine or produced by an AI model, always with producer metadata. | Deterministic analysis output, an AI explanation, a proposed action | The deterministic engine and the AI layer |
| `HUMAN_VALIDATED` | A new record, linked to its source, that an authorized human explicitly validated. | An approved status change, a validated resolution, a knowledge entry | The human review flow |

## Rules

1. Every stored record has exactly one provenance value. It is set when the
   record is created and is never edited.
2. Provenance never changes. To change it, create a new record that links to the
   original. For example, when a human validates a `GENERATED` hypothesis, a new
   `HUMAN_VALIDATED` record is created that references it, and the hypothesis
   stays `GENERATED`.
3. `GENERATED` records also name their producer: either the deterministic engine
   with its version, or an AI model with its model ID. The UI keeps the two
   apart, because `GENERATED` alone does not say whether a result was computed
   or inferred.
4. Derived output keeps its inputs visible. If any input to an analysis is
   `SYNTHETIC`, the analysis is marked as depending on synthetic data.
5. `GENERATED` records are never used as evidence for a claim. Evidence comes
   only from `SUPPLIED`, `SYNTHETIC`, `INTEGRATION` or `HUMAN_VALIDATED`
   records.
6. Only the human review flow creates `HUMAN_VALIDATED` records. Each one needs
   an authorized reviewer, a timestamp and links to what was validated. No
   automated process, AI model or simulator can create them.
7. Only an authenticated integration adapter creates `INTEGRATION` records.
   Manual entry, fixtures and the simulator never use `INTEGRATION`, so demo
   data cannot pass as data from a real system.
8. Provenance is shown wherever a record is shown, including in Show Me Why.

## Supplied vs synthetic policy

1. The supplied fixture (`fixtures/c02/c02-supplied.json`) is a verbatim
   transcription. It is never edited to make a feature or a demo work.
2. Synthetic data lives in separate files or records, each marked `SYNTHETIC`.
   The proposed location is `fixtures/synthetic/`, which does not exist yet.
3. Synthetic data never fills a gap inside a supplied record. For example,
   adding a date to R-1's 08:40, or a stage-entry time to W-1, means creating a
   separate `SYNTHETIC` record. The supplied record is not changed.
4. The UI labels synthetic data wherever it appears, including in analyses that
   depend on it.
5. A synthetic SLA or clock may be used to demonstrate time in stage and
   workflow drift. It is labelled `SYNTHETIC` and never presented as a C02
   requirement.
6. No fixture contains real personal information. Use roles. Any synthetic name
   must be obviously fictional. Never use real phone numbers, email addresses or
   Telegram chat IDs.
7. Synthetic scenarios may deliberately contain contradictions for a demo, as
   long as they are labelled.
8. Synthetic data is never labelled `INTEGRATION`, even when it imitates data a
   real system would send.
