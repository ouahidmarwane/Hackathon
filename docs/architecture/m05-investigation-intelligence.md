# M05 Investigation Intelligence

Status: local hackathon implementation; no commit, push, remote mutation or M06.

## Architecture and contract

Persisted source snapshot → frozen M03 findings → existing tower view → server-only
InvestigationProvider → structured InvestigationPlan → existing investigation UI.
The provider runs once per work order, not once per claim or clickable issue.
The workshop template, reader, SQL and M03 classifications remain unchanged.

`src/domain/investigation.ts` defines an asynchronous provider interface and a
structured plan: job identity, known facts, uncertainties, missing codes,
verification steps, suggested verification action, recorded owners and assignment
verification state, rationale, source IDs, GENERATED origin, producer/version and
synthetic dependency. Each statement has claim/event/finding IDs, missing codes and
an explicit investigation rule ID. `operationalAction` is always null.

The deterministic provider identifies itself as
`deterministic-investigation-provider`, version `investigation/c02/v1`. It requires
no model, SDK, external request, new credential or environment setting. It never
evaluates or overrides M03. It rejects cross-job, orphan, duplicate or mismatched
finding references. Inputs are trusted normalized source records and M03 output,
not arbitrary browser payloads. Source values remain quoted data and are escaped
by React; they are never instructions, executable markup or tool arguments.

## Grounded rules and grouping

`src/server/investigation/rules.ts` exhaustively maps all 12 current M03 missing
codes to uncertainties and evidence-oriented verification steps. Reference
resolution precedes dependent receipt review; dispatch precedes customer-response
review. Receipt review precedes handoff, then stage verification. This is a fixed
dependency-oriented order, not severity, confidence, blame or M08 priority scoring.
Other source identities are sorted deterministically; no clock or random values
affect output. Unknown codes preserve their IDs and receive an explicit UNKNOWN_GAP
abstention/review instruction rather than invented interpretation.

One coherent work-order plan groups all related claims/events/findings, with owner
verification as supporting context. Current examples: Parts / handoff, Approval,
Quality-check and Readiness investigations. Multiple recorded owners stay visible;
no owner is selected as authoritative without evidence, and none is invented.

W-1 preserves recorded Awaiting parts / Received, exact receipt-reference support
and the supplied R-1 scan at 08:40. It asks for required-part receipt, job/technician
handoff and current stage evidence, and suggests confirming handoff before any
status proposal. W-2 separates preparation, dispatch and response, leading with
dispatch verification. W-3 requests QC progress and independent device evidence
without offline causation or blockage. W-4 requests readiness evidence without
turning recorded Ready into verified completion.

All plans state: No evidence-backed operational action can be proposed yet. They
continue with missing requirements, authoritative sources to inspect and a useful
verification step. Even supported-only input supplies no operational transition
authority. Explicit conflicts require source/scope review without choosing which
observation is current. Synthetic dependencies remain labelled in trace details.

## UI and future adapter

Investigate retains the existing pipeline interaction and opens generated
guidance: What we know, What's uncertain, What to verify, Recorded next owner,
Suggested next step and Why this investigation. The rationale disclosure exposes
provider/version, source IDs/codes and statement-level grounding. Existing
technical verification details and Show Me Why remain in a native disclosure;
the complete evidence inspector remains below the pipeline. This is deterministic
generated investigation, never described as AI-generated.

A future LLM provider can implement the same asynchronous contract with structured
evidence input. Before use it must validate its structured output schema, exact
job/reference scope, provenance/version, source dependency and every factual
assertion against source/M03/rule authority. Reference presence alone is not
semantic grounding. It must preserve classifications and abstention, treat source
text as untrusted data, and fall back to deterministic guidance on invalid output
or unavailable service. No LLM adapter or generic LLM output validator is installed
in M05. Workflow writes, approvals/corrections and actions belong to later review.

## Validation scope

Tests cover deterministic grouping, all current codes, statement references,
provider interface, W-1–W-4 semantics, useful abstention, missing/multiple owners,
unknown codes, injected source instructions, invalid scopes, synthetic dependency,
HTML escaping, server-only read-only boundaries and guidance rendering.
HTTP checks exercise actual persisted records; browser click/layout review remains
unavailable and is not claimed. No database schema, data or RLS change is made.
