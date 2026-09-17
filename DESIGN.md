---
name: Workshop Flow Intelligence
description: Light workshop software for inspecting recorded claims and their evidence.
colors:
  primary: "#225ec2"
  blue-wash: "#edf4ff"
  ink: "#182b43"
  muted: "#596b7e"
  line: "#e0e7ef"
  surface: "#f5f7fb"
  white: "#ffffff"
  supported-text: "#286351"
  supported-fill: "#edf6f1"
  gap-text: "#825c18"
  gap-fill: "#fff6e5"
  conflict-text: "#9b363b"
  conflict-fill: "#fff0f1"
typography:
  heading:
    fontFamily: "Manrope, sans-serif"
    fontSize: "27px"
    fontWeight: 750
    lineHeight: 1.3
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  badge: "4px"
  control: "7px"
  navigation: "8px"
  panel: "12px"
---

# Design System: Workshop Flow Intelligence

## Overview

A professional, light workshop SaaS interface: white panels, cool neutral backgrounds, clean blue and baby blue accents, navy/slate text, restrained status colors and generous whitespace. The shell supports reviewing records and inspecting claim-level evidence.

This is source-derived documentation of M04/M04.2, based on `PRODUCT.md`, `src/app/globals.css`, `src/app/layout.tsx` and `src/components/control-tower/`. No browser review or visual certification was performed. The prototype uses a local-only official CLI server reader; production access is disabled.

## Colors

Primary blue marks links, controls and the brand; blue wash marks active navigation and selected records. Ink and muted slate establish text hierarchy. White panels sit on the surface neutral, with line-colored dividers.

Evidence badges pair supported green, insufficient-evidence amber and conflicting-evidence red with explicit text and icons. These classifications apply to claims; they are not job diagnoses. System status likewise includes a written loaded, loading or unavailable label beside its colored dot.

Provenance is a separate vocabulary: Supplied and Integration use neutral badges; Generated uses blue-gray (text `#47648a`, fill `#edf2fa`); Synthetic uses purple (text `#754997`, fill `#f7f1fc`); Human validated uses green (text `#286351`, fill `#edf7f3`). Provenance never substitutes for the evidence classification.

## Typography

Manrope is self-hosted from `public/fonts/manrope.ttf` through `next/font/local`, exposed as `--font-workshop`, with `display: swap` and a sans-serif fallback. It serves both headings and body copy.

Page headings use the heading token; case detail titles are (22px), section headings (14–15px), and most supporting copy (11–13px). Provenance and trace labels are (10px). Headings use balanced wrapping and tight tracking; long explanations are bounded at (65–75ch). Counts and event times use tabular numerals. Source identifiers use semantic `code` elements with wrapping.

## Layout

The desktop shell is a two-column grid with a (224px) white sidebar and flexible body. A (72px) topbar sits above content capped at (1600px), with (35px 36px 32px) content padding. Five metrics share one bordered panel. The workbench is a master-detail grid: a case browser of `minmax(265px, 32%)` beside a flexible detail pane. Detail sections use approximately (24px 27px) padding; recorded fields and trace metadata use two-column grids.

Responsive rules use maximum-width media queries:

- **1200px:** sidebar narrows to (194px); content padding becomes (28px 24px); browser width becomes (270px).
- **1000px:** sidebar becomes a (76px) icon rail; brand text, sidebar notes, footer and Later labels hide. Browser width becomes (250px); missing requirements become one column and assessment headings wrap.
- **760px:** shell stacks; brand text returns, navigation becomes horizontal and unavailable destinations hide. Topbar becomes (46px), content padding (25px 18px), metrics use three columns, and the browser sits above detail with a two-column case list. Case missing summaries hide, but detailed requirements remain available.
- **420px:** trace metadata becomes one column; assessment headings wrap and compact case text shrinks. Recorded fields and the case list retain two columns.

These are implemented source rules, not measured guarantees of fit at every viewport.

## Elevation & Depth

Panels are flat, separated by borders and tonal backgrounds. There are no ambient elevation shadows. The selected case has a narrow blue inset marker (`inset 1px 0 #5089df`) beside its blue wash. Native expanded explanations use a slightly darker neutral inset surface.

## Shapes

Panels have gently rounded corners using the panel token; inputs and buttons use the control token. Navigation is slightly softer, while provenance badges use compact badge corners and thin borders. Evidence badges use (5px) corners. Line icons reinforce labels without adding illustration or decorative imagery.

## Components

- **Operational journey:** seven compact circular stage nodes share one connected dashed process line: Reception, Diagnosis, Parts / Approval, Repair, Quality check, Ready, Collection. Gray means unverified workflow context; a blue ring marks the recorded source position. No earlier node turns green merely because the recorded position advances. At 1200px or below the line stacks vertically with readable labels and attached evidence.
- **Attachments and investigation:** actual events, original clock values and exact green supported-relationship checks sit beneath relevant stages. One compact amber/red marker groups each area's verification issues; its Investigate action opens and focuses server-rendered details with related issue selectors. Close restores focus to the origin. Red requires a genuine conflict. Owner gaps stay case metadata. Detailed investigation text stays out of the process line.
- **Detailed evidence inspector:** a native collapsed disclosure preserves the original recorded-state, available-evidence, assessment and missing-requirement sections beneath the journey investigation.

The frontmatter is a compact core token inventory, not an exhaustive literal-value
allowlist. Implemented tonal variants and compact typography/radii are visible
in `globals.css`; the M04.1 detector reported advisory inventory differences.
These findings are recorded rather than represented as a clean detector pass.

- **Navigation:** Control Tower, Cases and Evidence are links with active blue-wash styling and `aria-current="page"`. Activity and Knowledge are noninteractive spans marked `aria-disabled="true"` and Later. Hover uses a subtle neutral wash. At the icon-rail breakpoint, link text remains in the markup although CSS sets its font size to zero.
- **Case browser:** a labeled native search form submits job, recorded stage or owner queries. All cases, With gaps and With conflicts are links; current filters and selected cases use `aria-current`. Rows retain recorded owner wording and claim counts. The selected case defaults to the first matching record when no matching explicit selection exists.
- **Refresh and retry:** refresh is a white bordered link with blue-tinted hover; retry is a blue filled link with darker-blue hover. Both reload records through navigation. They do not change workshop workflow.
- **Recorded state and evidence:** definition lists show claims with provenance. Events retain source identifiers, raw recorded times and provenance; clock-only values explicitly lack supplied date/timezone. An empty evidence area states that no independent events are recorded. Evidence view moves available evidence before recorded state.
- **Show me why:** native `details`/`summary` starts collapsed and supports keyboard activation. The summary arrow rotates when open; hover underlines the blue label. Expanded content exposes the evaluated claim, source claims, related/supporting/conflicting event identifiers, missing requirements, deterministic rule code/version and finding origin, including synthetic dependency when present.
- **Data states:** loading uses static neutral skeleton blocks and a loading status label. Empty source results show a dedicated no-records message. Connection or verification failures show an alert and retry link; configuration failures explain the reader requirement. No matching cases offers Clear filters and a no-selection detail state. These states do not substitute example records or assessments.

Global keyboard focus uses a (3px) blue outline (`#316ecf`) with (4px) offset; search input offsets its outline by (2px). A focus-revealed Skip to content link targets the main landmark. Navigation and case regions have accessible names, search has a visually hidden label, and icon-only submit has an explicit label. Badges and status indicators carry readable text alongside color. Long identifiers wrap instead of being clipped. The document language is English. Reduced-motion preference sets scroll behavior to auto; the stylesheet defines no animated loading pulse or timed transitions.

## Do's and Don'ts

- **Do** preserve white/light neutral surfaces, restrained blue accents, navy/slate hierarchy and whitespace.
- **Do** keep provenance, recorded claims and evidence findings visibly distinct; retain inspectable source and rule details.
- **Do** retain native semantics, visible keyboard focus and text labels for statuses.
- **Don't** turn missing evidence into a diagnosis, employee score, operational blockage or assigned task.
- **Don't** introduce AI output, workflow actions, timing calculations or simulation into this M04 review surface.
- **Don't** describe this source record as browser-verified accessibility, responsive fit or visual certification.
