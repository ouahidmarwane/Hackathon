# C02 supplied fixture

File: [`fixtures/c02/c02-supplied.json`](../../fixtures/c02/c02-supplied.json)

The fixture lives in a top-level `fixtures/` folder so that test data stays
separate from the docs and the application code. It is read by the Vitest
tests under `tests/`.

## Format

| Key | Contents |
|---|---|
| Top level | `fixture_id`, `fixture_version`, `source`, `description`, `jobs`, `events`, `rules` |
| `jobs[]` | `job_id`, `provenance`, `fields` |
| `events[]` | `event_id`, `provenance`, `fields` |
| `rules[]` | `rule_id`, `provenance`, `text` |

Conventions:

- `fields` holds the supplied keys and values exactly as supplied, in lowercase.
  Nothing is normalized, renamed or added.
- A key missing from `fields` was not supplied. It means **unknown**. It does
  not mean false, "not required" or "none".
- Times are kept as the strings supplied (`"08:40"`). No date or time zone was
  supplied, so the fixture adds none.
- Every record has provenance `SUPPLIED`, and the file contains nothing else.

## Supplied content

### Jobs

| Job | stage | Other supplied fields | next_owner |
|---|---|---|---|
| W-1 | awaiting parts | part_receipt: received; receipt_ref: R-1 | parts coordinator |
| W-2 | repair paused | part: not required; customer_approval: missing | service adviser |
| W-3 | quality check | device_state: offline | workshop controller |
| W-4 | ready | customer_approval: received | collection desk |

### Events

| Event | job_id | event | time |
|---|---|---|---|
| R-1 | W-1 | part scan | 08:40 |
| E-2 | W-2 | approval request prepared | 08:50 |

### Rules

| Rule | Text |
|---|---|
| RULE 1 | Task recommendations require a source record and an owner. |
| RULE 2 | Do not create employee performance scores from these events. |
| RULE 3 | Writing/updating workflow status requires reviewer approval. |

## What the data shows directly

The facts below can be read straight from the records, without interpretation.
M03 tests can assert them.

- W-1's `receipt_ref` is R-1, and event R-1 has `job_id` W-1.
- Event E-2 has `job_id` W-2.
- Only W-1 and W-2 have events. W-3 and W-4 have none.
- Every job has a `next_owner`.
- W-1 is the only job with `part_receipt`. W-3 is the only job with
  `device_state`. W-2 and W-4 are the only jobs with `customer_approval`.
- No record contains a date, a time zone, a stage-entry time, an SLA or the
  current time.

## Interpretation constraints

Each constraint has an ID so that tests and documents can refer to it.

| ID | Constraint |
|---|---|
| IC-1 | R-1 ("part scan") shows only that a part scan for W-1 was recorded at 08:40. It does not prove that the required part reached the technician. |
| IC-2 | E-2 shows only that an approval request was prepared. It does not show that the request was sent or answered. |
| IC-3 | W-3's `device_state` of "offline" does not show whether quality check is blocked or progressing. |
| IC-4 | W-4's stage of "ready" is a recorded state. W-4 must not be treated as operationally verified just because its recorded stage says ready. |
| IC-5 | Do not calculate durations from 08:40 and 08:50. The times have no date, and they belong to different jobs. |
| IC-6 | C02 supplies no SLA, no current time and no stage-entry timestamp, so time in stage cannot be calculated from the supplied data. Report it as unavailable, or use timing that is clearly labelled `SYNTHETIC`. |
| IC-7 | A field missing from a job is unknown (see [Format](#format)). For example, W-3 has no `customer_approval` field, which says nothing about approval for W-3. |
| IC-8 | `next_owner` values are roles. They route work and are never used to score people (RULE 2). |

IC-1 to IC-6 come from the M01 project brief. IC-7 and IC-8 are fixture
conventions: IC-7 follows from the brief's instruction not to add invented
facts, and IC-8 follows from RULE 2. It is not confirmed that IC-1 to IC-6 are
verbatim C02 text. Until that is confirmed, they are treated as the team's
interpretation, not as `SUPPLIED` records, and so they are not part of the
fixture file.

## Using the fixture in tests (M03)

- Load the fixture read-only and never modify it in a test. If a test needs a
  variant, copy the data first.
- If a test needs extra data, put it in a separate `SYNTHETIC` fixture.
- Assert against the constraints above. For example, no analysis of the
  supplied data may report a time in stage, and none may treat R-1 as delivery
  of the part to the technician.
- Add a structural test that asserts every record is `SUPPLIED` and that the
  fields match the tables on this page.

## Open question

The fixture was transcribed from the M01 project brief, not from the original
C02 challenge document, which is not in this repository. It should be checked
against the original for wording, casing and IDs. If the challenge terms allow
it, the original document should be added to the repository.
