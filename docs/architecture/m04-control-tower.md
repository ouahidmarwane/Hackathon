# M04 Control Tower

Status: M04.2 local implementation for product/UI review. No commit or push. M03 is
frozen, and M02 schema, privileges, source content and provenance are unchanged.

## Runtime path

Persisted Supabase records → server-only linked CLI reader → explicit normalized
jobs/claims/events snapshot → frozen `evaluateEvidence` → presentation view model
→ Next Server Components and a minimal client journey selection controller.

`supabase/queries/control-tower.sql` contains a fixed, schema-qualified single
snapshot SELECT inside `BEGIN READ ONLY` / `COMMIT`. The query projects only
M02 source fields, preserves IDs/provenance/clock time, and never interpolates
search, route, case or filter values. SQL returns one consistent statement
snapshot. Empty arrays are an actual empty source, never fixture substitution.

`src/server/control-tower/loader.ts` invokes the pinned official CLI through
`execFile` without a shell. It validates the ignored linked project ref against
the configured existing public project URL before executing the fixed query.
It never reads credential caches or prints tokens. Process failures are replaced
with categorical errors; stdout/stderr/arguments are not exposed to the page.
Execution has a 20-second timeout and a 2 MB output limit.

The loader explicitly reconstructs normalized records, strips persistence-only
fields, rejects missing collections/fields, orphan references and ambiguous job
identities, and reuses M03's input/time validation. Sources remain source records;
findings remain GENERATED. The service evaluates M03 and creates a view model,
cached only within the React server request. There is no persistent snapshot cache
or automatic writer, seed, reevaluation trigger, or database mutation.

## Security decision and environment

The publishable key cannot read these tables. M02 also revoked service_role
privileges, so adding a secret service-role key would not solve access. Direct
database credentials or a new permission migration are unnecessary for the local
prototype: the already authenticated official CLI can issue the fixed Management
API read. The CLI's own auth machinery retains its existing token; the app does
not copy it to `.env.local` or inspect its credential storage.

This is intentionally a **local development reader**. The development script
binds to `127.0.0.1`. The reader rejects all non-development execution before
reading linking state or invoking the CLI. Build performs no remote source read.
Production runtime displays the server-access configuration state, not source
records. Do not rebind this privileged developer workspace to a public interface.
RLS enabled/forced state, zero application policies and denied public grants remain
unchanged. This uses an existing trusted admin capability rather than broadening
browser table access. It is not a multiuser authentication architecture.

For local use: the existing project must be linked, the official CLI must already
be logged into its authorized account, and the ignored `.env.local` must contain
the existing project's public settings. Run `npm run dev`. If login expires,
authenticate through the official CLI prompts; never paste credentials into app
code or a report. No new secret environment variable is introduced.

Environment names: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `NODE_ENV` is set by Next itself, not a
secret. Linking/authentication state remains ignored under the official CLI's
storage conventions.

Public/production deployment needs a reviewed authenticated server reader and
viewer authorization. An alternative direct Management API implementation would
require its own server token; the documented
[query endpoint](https://supabase.com/docs/reference/api/v1-run-a-query) provides
a read-only query option, but introducing another token is not needed here.
No privileged credential is ever passed as a React prop or browser environment
setting. The app supports local product review now; it is not deployment-ready.

## Presentation boundary

`src/presentation/control-tower.ts` formats property, provenance, classification
and missing-code labels. It groups engine findings by claim/job and counts exact
canonical classifications. It never derives new evidence conclusions.

The overview reports job count, evaluated claims, supported claims, insufficient
claims (labelled evidence gaps) and conflicting claims. C02 currently yields
4 / 14 / 1 / 13 / 0, calculated from the runtime snapshot and engine findings.
Case summaries are counts, not a new job-wide evidence state or diagnosis.
Multiple recorded stage/owner claims remain visible rather than selecting a
silently inferred current value. Missing requirements are deduplicated in stable
claim display order, with stage-related gaps before owner verification.

## Information hierarchy and interaction

The light shell uses a blue navigation accent, navy/slate type and restrained
status colors. The sidebar offers functional Control Tower, Cases and Evidence
views of the same persisted snapshot. Activity/Knowledge are disabled labels
marked Later, with no fake routes or functions.

The master/detail workspace keeps all work orders visible. Case rows show job
ID, recorded stage/owner, provenance, claim-state counts, event count and a missing
requirement. Selecting a case changes a shareable query parameter. Search matches
job/stage/owner in the server-created view model; evidence filters select cases
containing gap/conflict claims. They do not change engine input or conclusions.
No matching filter displays a distinct reset state.

The detail leads with the selected work order, its recorded stage/next owner and
an operational journey. It then offers focused evidence investigation, followed
by a collapsed Detailed evidence inspector. The inspector preserves recorded
state, available independent events, claim-level assessment and missing
requirements. Evidence view moves events ahead of recorded claims inside that
inspector. Every finding has a native keyboard-operable Show Me Why disclosure:
evaluated/source claim IDs, related/supporting/conflicting event IDs, exact missing
codes with labels, the frozen rule description/code/version, GENERATED provenance,
producer and synthetic dependency if applicable. The UI contains no W-1/W-2/R-1
card definitions or copied evaluation rules.

## M04.2 workshop lifecycle pipeline

The primary visualization is now the workshop business process, not the M04.1
recorded-state/event/gap three-card sequence. `workshop-pipeline.ts` defines one
explicit presentation-level product template: Reception → Diagnosis → Parts /
Approval → Repair → Quality check → Ready → Collection. These labels are process
context, not SUPPLIED challenge records, historical transitions or database data.
They never carry source provenance or fabricated timestamps/completion flags.

The pipeline is not necessarily a complete historical timeline. Gray nodes and
neutral dashed connecting lines indicate unverified process context. Blue rings
identify only the source's recorded position. Earlier nodes remain gray even for
Ready. No source evidence currently verifies completion of these stages. Exact
SUPPORTED relationships use a separate green check attached to source evidence;
ordinary gaps use amber and genuine CONFLICTING_EVIDENCE uses red. Text, icons
and labels distinguish these meanings independently of color.

The existing `operational-journey.ts` model remains useful for source projections
and engine-derived issue groups. `buildWorkshopPipeline` attaches these objects
to template stages through explicit presentation mappings: awaiting parts to
Parts / Approval, repair paused to Repair, quality check to Quality check and
ready to Ready. It maps event types and missing-code families to relevant
workflow areas without claiming successful transitions or causal relationships.
Unknown source positions/events remain visible in an unplaced evidence area,
rather than inventing a workflow position. Owner verification stays case metadata.

W-1: Parts / Approval has the recorded Awaiting parts position, actual R-1 part
scan at 08:40, exact receipt-reference support and one compact marker grouping
handoff, required-part receipt and recorded-stage requirements (three gaps).
W-2: Repair holds the recorded Repair paused position; Parts / Approval holds E-2
approval request prepared at 08:50 and dispatch/response requirements. Neither
stage mapping implies customer contact or approval. W-3: Quality check is the
recorded position with progress/device verification issues, no fabricated event
and Offline only in recorded context. W-4: Ready is the recorded position with
readiness/stage verification gaps; all preceding process nodes stay unverified.
Customer approval verification can remain attached to Parts / Approval.

Clicking a grouped amber/red marker opens and focuses the existing server-rendered
investigation inline. Related issue selectors expose each actual finding group;
Close investigation restores focus to the originating marker. No investigation
text is permanently placed inside the process line. The complete Detailed evidence
inspector remains below it, preserving all original source and rule disclosures.

`JourneyController` receives only minimal display DTOs and server-rendered panel /
context children. It owns selection/focus only, with no server reader, SQL, raw
source objects or engine runtime imports. Native buttons expose aria-controls,
aria-expanded and selected-issue state; investigation is programmatically
focusable. Selection resets on work-order changes. The read path and frozen M03
semantics remain unchanged.

Actual future events/findings flow through the existing read → normalize → M03
? view model → pipeline path. The template never fixes a job's evidence count or
assumes completion from its position. Future simulation must use reviewed
validated ingestion and SYNTHETIC provenance; there is no simulator or writer
here. Future M05 investigation intelligence is deferred. Test-only conflict
sources exercise the actual engine's red branch and never enter Supabase.

W-1: receipt_ref is supported only as a valid reference relationship; stage and
part_receipt remain insufficient. R-1 is a scan, with the handoff requirement
visible. W-2: preparation remains preparation, with dispatch/response requirements.
W-3: quality check/offline remain recorded claims, with no independent events.
W-4: ready is recorded, with readiness confirmation still missing. No owner or
customer is assigned blame. No stage is labelled blocked, stale, delayed or normal.

Clock events display exact original raw values with “Clock only · date and
timezone not supplied.” No duration, SLA or current-time comparison is invented.

## Loading, empty, error and responsiveness

Next's loading boundary shows a labelled skeleton and truthful loading status.
Source/access/normalization failure displays no metrics or substituted case data
and changes the header to Workshop data unavailable. Empty source returns No
workshop records available. Retry/refresh navigate to read dynamic data again.
Raw database/CLI error messages never render.

The desktop shell has a full sidebar and master/detail split. Tablet uses compact
icon navigation while links retain accessible names. At 760 px or below, navigation
becomes horizontal and case/detail sections stack. At 420 px or below, trace fields
stack. Long IDs wrap; statuses carry readable labels/icons in addition to color.
Controls have focus styles; a skip link and semantic landmarks support keyboard
navigation. A self-hosted Manrope variable font includes its SIL OFL license.
Seven compact stage nodes share one horizontal desktop process line. At 1200 px
or below, the process stacks vertically with a continuous dashed connector,
readable stage labels and attached evidence. Investigation columns also stack;
no horizontal journey scroller is introduced. Browser fit remains unverified.

## Validation and limits

Tests cover source mapping, IDs/counts/provenance, clock preservation, ordering,
actual M03-derived summaries, W-1 links, test-only conflict counts, every label,
rendered detail/badges/states, missing/invalid source rejection, production refusal,
and UI/server/SQL boundaries. No new testing framework or package is installed;
Vitest now includes TSX test files alongside TS.

M04.1 preserved the existing 167 tests and added 25 source/journey/render tests.
M04.2 preserves them and adds lifecycle/model/render tests for template context,
recorded mapping, no inferred stage completion, grouped gaps, event placement,
unmapped sources, dynamic evidence and vertical-capable semantics. The existing
test-only genuine conflict still verifies red controls. Render tests do not
execute actual browser click, focus, closing or hydration behavior.

HTTP verification against the running local application confirmed real Supabase
records, all four jobs, R-1, the engine-active state and source/rule disclosures.
Selected W-2/W-4, filters and evidence view are also checked through rendered HTTP
markup. This is **not visual verification**.
M04.2 HTTP checks verify seven process nodes, the correct blue recorded position,
real event attachments, unverified previous stages and closed investigation
markup for all four work orders. This remains markup verification rather than browser interaction.
Both available browser-selection
attempts reported no browser; screenshots, measured layout, console/hydration
inspection and actual keyboard/reflow review remain pending product review.
The M04 detector initially returned no findings. The M04.1 detector reports
advisory color/type/radius differences against the compact design token inventory;
these are documented implementation variations, not a clean detector result.
Code review found three
low-contrast text colors; all were corrected and rechecked above 4.5:1 at declared
color scope. This does not certify browser-computed contrast/layout.

## Deferred

M05 investigation/AI; M06 approvals/corrections/actions; timing, organizational
memory, notifications and simulation. Also deferred: durable finding history,
production reader/authentication, enterprise tenancy and operational diagnoses.
No recommendations, enabled human-review controls, simulation controls, charts,
employee metrics or AI status claims are rendered.
