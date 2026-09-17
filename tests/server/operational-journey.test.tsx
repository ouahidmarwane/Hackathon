import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { transformC02 } from "@/server/ingestion/c02";
import { normalizeSnapshot } from "@/server/control-tower/loader";
import { evaluateEvidence } from "@/domain/evidence-engine";
import { buildTowerView, type CaseView } from "@/presentation/control-tower";
import { buildOperationalJourney, investigationFindings, journeyDisplayNodes } from "@/presentation/operational-journey";
import { OperationalJourney } from "@/components/control-tower/operational-journey";
import { CaseDetail } from "@/components/control-tower/case-detail";
import { InvestigationSummary } from "@/components/control-tower/investigation-summary";
import type { ClaimRecord, EventRecord } from "@/domain/operational-model";

let cases: CaseView[];
beforeAll(async () => { const snapshot = normalizeSnapshot(await transformC02()); cases = buildTowerView(snapshot, evaluateEvidence(snapshot)).cases; });
const journey = (index: number) => buildOperationalJourney(cases[index]);
const events = (index: number) => journey(index).nodes.filter(node => node.kind === "OBSERVED_EVENT");

describe("runtime-derived operational journey", () => {
  it.each([0, 1, 2, 3])("distinguishes original state/event sources from generated gaps for case %i", index => {
    const model = journey(index);
    const stages = model.nodes.filter(node => node.kind === "RECORDED_STATE");
    expect(stages.map(node => node.title)).toEqual(cases[index].stages.map(value => value.charAt(0).toUpperCase() + value.slice(1)));
    expect(events(index)).toHaveLength(cases[index].events.length);
    for (const node of model.nodes) {
      expect(node.provenance).toBe(node.kind === "EVIDENCE_GAP" || node.kind === "CONFLICT" ? "GENERATED" : "SUPPLIED");
      for (const id of node.claim_ids) expect(cases[index].claims.some(claim => claim.id === id)).toBe(true);
      for (const id of node.event_ids) expect(cases[index].events.some(event => event.id === id)).toBe(true);
    }
    expect(model).not.toHaveProperty("diagnosis"); expect(model).not.toHaveProperty("classification");
    expect(model.nodes.every(node => !Object.hasOwn(node, "duration"))).toBe(true);
  });
  it("does not invent transitions or times for any source", () => {
    for (const item of cases) {
      const model = buildOperationalJourney(item);
      for (const node of model.nodes) {
        if (node.kind === "OBSERVED_EVENT") expect(item.events.find(event => event.id === node.event_ids[0])!.occurred_at_raw).toBe(node.time_raw);
        else expect(node).not.toHaveProperty("time_raw");
      }
      expect(JSON.stringify(model)).not.toMatch(/Vehicle arrived|Parts ordered|Repair resumed|SLA|waiting_time|blocked|stale|failure/);
    }
  });
  it("derives gaps only from INSUFFICIENT_EVIDENCE missing codes", () => {
    for (const item of cases) for (const issue of buildOperationalJourney(item).issues) {
      expect(issue.kind).toBe("EVIDENCE_GAP");
      for (const code of issue.missing_codes) expect(item.findings.some(finding => finding.classification === "INSUFFICIENT_EVIDENCE" && finding.missing_evidence.includes(code))).toBe(true);
    }
  });
  it("orders deterministically and never mutates the view model", () => {
    for (const item of cases) {
      const before = JSON.stringify(item);
      const first = buildOperationalJourney(item);
      expect(buildOperationalJourney(item)).toEqual(first);
      expect(JSON.stringify(item)).toBe(before);
      expect(buildOperationalJourney({ ...item, events: [...item.events].reverse(), findings: [...item.findings].reverse() })).toEqual(first);
    }
  });
  it("does not rely on job identifiers or a fixed three-node workflow", () => {
    const item = structuredClone(cases[0]);
    item.job.external_id = "CUSTOM-ORDER";
    item.events.push({ ...item.events[0], id: "other-event", external_id: "other-ref", event_type: "independent observation", time_kind: "unknown", occurred_at_raw: null });
    const model = buildOperationalJourney(item);
    expect(model.nodes.filter(node => node.kind === "OBSERVED_EVENT")).toHaveLength(2);
    expect(model.nodes.some(node => node.title === "Independent observation")).toBe(true);
    const markup = renderToStaticMarkup(<CaseDetail item={item} />);
    expect(markup).toContain("Work order CUSTOM-ORDER"); expect(markup).toContain("other-ref");
  });
  it("does not retain a gap after the passed engine finding no longer contains it", () => {
    // Presentation fixture only: never substitute this for actual engine output.
    const item = { ...cases[0], findings: cases[0].findings.map(finding => ({ ...finding,
      missing_evidence: finding.missing_evidence.filter(code => code !== "PART_TO_JOB_HANDOFF_CONFIRMATION") })) };
    expect(buildOperationalJourney(item).issues.some(issue => issue.missing_codes.includes("PART_TO_JOB_HANDOFF_CONFIRMATION"))).toBe(false);
  });
  it("provides only minimal display props to the interactive controller", () => {
    for (const node of journeyDisplayNodes(journey(0))) {
      expect(node).not.toHaveProperty("claim_ids"); expect(node).not.toHaveProperty("event_ids");
      expect(node).not.toHaveProperty("finding_claim_ids"); expect(node).not.toHaveProperty("rule_version");
      expect(node).not.toHaveProperty("producer");
    }
  });
  it("does not manufacture a recorded stage for a source without one", () => {
    const item = { ...cases[0], claims: cases[0].claims.filter(claim => claim.property !== "stage") };
    expect(buildOperationalJourney(item).nodes.some(node => node.kind === "RECORDED_STATE")).toBe(false);
  });
  it("does not manufacture a verified complete workflow when no gaps are returned", () => {
    const item = { ...cases[0], findings: [], missing: [] };
    expect(buildOperationalJourney(item).issues).toEqual([]);
    expect(renderToStaticMarkup(<OperationalJourney item={item} />)).toContain("not a job-wide operational diagnosis");
  });
});

describe("supplied C02 journey semantics", () => {
  it("W-1 renders recorded Awaiting parts, observed R-1/08:40 and the handoff gap", () => {
    const model = journey(0);
    expect(model.nodes[0]).toMatchObject({ kind: "RECORDED_STATE", title: "Awaiting parts", provenance: "SUPPLIED" });
    expect(events(0)[0]).toMatchObject({ kind: "OBSERVED_EVENT", title: "Part scan", event_ref: "R-1", time_raw: "08:40", temporal_note: "Clock-only · date/timezone not supplied" });
    expect(model.issues[0]).toMatchObject({ kind: "EVIDENCE_GAP", title: "Part-to-job / technician handoff", missing_codes: ["PART_TO_JOB_HANDOFF_CONFIRMATION"] });
    expect(events(0)[0].support_labels).toEqual(["Receipt reference supported"]);
  });
  it("W-1 gap is an accessible investigation button linked to its rendered panel", () => {
    const issue = journey(0).issues[0];
    const markup = renderToStaticMarkup(<OperationalJourney item={cases[0]} />);
    expect(markup).toContain('type="button"'); expect(markup).toContain('aria-controls="'+issue.id+'-panel"');
    expect(markup).toContain('id="'+issue.id+'-panel"'); expect(markup).toContain("Investigate");
    expect(markup).toContain('tabindex="-1"');
  });
  it("W-1 investigation reuses explicit reference support and the receipt/stage gaps", () => {
    const issue = journey(0).issues[0];
    const related = investigationFindings(cases[0], issue);
    expect(related.map(finding => finding.subject.property)).toEqual(["stage", "part_receipt", "receipt_ref"]);
    const markup = renderToStaticMarkup(<InvestigationSummary item={cases[0]} issue={issue} />);
    expect(markup).toContain("Receipt reference = R-1 · Supported");
    expect(markup).toContain("Receipt confirmation for the required part");
    expect(markup).toContain("Part-to-job or technician handoff confirmation"); expect(markup).toContain("Recorded stage confirmation");
    expect(markup).toContain("Recorded next owner:"); expect(markup).toContain("Parts coordinator");
    expect(markup).toContain("evidence-engine/c02/v1"); expect(markup).toContain("Show me why");
    expect(markup).not.toMatch(/Stage is stale|Technician received|repair should resume|job is blocked/);
  });
  it("W-2 preserves preparation and both dispatch/response gaps", () => {
    const model = journey(1);
    expect(model.nodes[0].title).toBe("Repair paused");
    expect(events(1)[0]).toMatchObject({ title: "Approval request prepared", event_ref: "E-2", time_raw: "08:50" });
    expect(model.issues[0].missing_codes).toEqual(["APPROVAL_REQUEST_DISPATCH_CONFIRMATION", "CUSTOMER_APPROVAL_RESPONSE"]);
    const markup = renderToStaticMarkup(<OperationalJourney item={cases[1]} />);
    expect(markup).not.toMatch(/Customer contacted|Waiting on customer|Customer did not respond|Approval rejected/);
  });
  it("W-3 keeps offline contextual, with no fabricated device event or blocker", () => {
    const model = journey(2);
    expect(model.nodes[0].title).toBe("Quality check"); expect(events(2)).toEqual([]);
    expect(model.context).toContainEqual({ label: "Device state", value: "Offline", provenance: "SUPPLIED" });
    expect(model.issues[0].missing_codes).toEqual(["QUALITY_CHECK_PROGRESS_CONFIRMATION"]);
    expect(renderToStaticMarkup(<OperationalJourney item={cases[2]} />)).not.toMatch(/Device failure|Quality check blocked|Delay caused by device/);
  });
  it("W-4 keeps Ready recorded, with no fake readiness event or verified-complete badge", () => {
    const model = journey(3);
    expect(model.nodes[0]).toMatchObject({ title: "Ready", kind: "RECORDED_STATE" }); expect(events(3)).toEqual([]);
    expect(model.issues[0].missing_codes).toEqual(["OPERATIONAL_READINESS_CONFIRMATION"]);
    expect(renderToStaticMarkup(<OperationalJourney item={cases[3]} />)).not.toMatch(/Verified ready|Completed pipeline|All healthy/);
  });
  it.each([0, 1, 2, 3])("retains the full evidence inspector below the journey for case %i", index => {
    const markup = renderToStaticMarkup(<CaseDetail item={cases[index]} />);
    expect(markup.indexOf("Operational journey")).toBeLessThan(markup.indexOf("Detailed evidence inspector"));
    for (const label of ["Recorded state", "Available evidence", "Evidence assessment", "What’s missing?", "Show me why"]) expect(markup).toContain(label);
    expect(markup).toContain('<details class="evidence-inspector">');
  });
});

describe("future genuine conflict presentation (test-only sources)", () => {
  function conflictCase() {
    const job = { ...cases[2].job, source: "synthetic:unit", provenance: "SYNTHETIC" as const, producer: "unit-test" };
    const claim: ClaimRecord = { ...cases[2].claims.find(claim => claim.property === "device_state")!, source: job.source, provenance: job.provenance, producer: job.producer, value: "online" };
    const event: EventRecord = { id: "test-event", external_id: "test-event", job_id: job.id, source: job.source, provenance: job.provenance, producer: job.producer,
      event_type: "device state confirmed: offline", time_kind: "unknown", occurred_at_raw: null, occurred_at: null };
    const findings = evaluateEvidence({ claims: [claim], events: [event], device_links: [{ claim_id: claim.id, event_id: event.id, scope: "same-device-same-assertion" }] });
    return buildTowerView({ jobs: [job], claims: [claim], events: [event] }, findings).cases[0];
  }
  it("creates a conflict node only for genuine engine conflicts, retaining source/generated provenance", () => {
    const item = conflictCase(); const model = buildOperationalJourney(item);
    expect(model.issues[0].kind).toBe("CONFLICT"); expect(model.issues[0].provenance).toBe("GENERATED");
    expect(model.nodes.find(node => node.kind === "OBSERVED_EVENT")!.provenance).toBe("SYNTHETIC");
    expect(item.findings[0].classification).toBe("CONFLICTING_EVIDENCE");
    expect(cases.flatMap(item => buildOperationalJourney(item).issues).some(issue => issue.kind === "CONFLICT")).toBe(false);
  });
  it("renders a labelled red-semantic conflict control with evidence inspection", () => {
    const markup = renderToStaticMarkup(<OperationalJourney item={conflictCase()} />);
    expect(markup).toContain("node-conflict"); expect(markup).toContain("is-conflict");
    expect(markup).toContain("Conflicting evidence"); expect(markup).toContain("Explicit incompatible evidence");
    expect(markup).toContain("Investigate"); expect(markup).not.toContain("Operational blocker");
  });
  it("keeps an unknown source time absent rather than inventing a timestamp", () => {
    const node = buildOperationalJourney(conflictCase()).nodes.find(node => node.kind === "OBSERVED_EVENT")!;
    expect(node.time_raw).toBeNull(); expect(node.temporal_note).toBe("Time not supplied");
  });
});
