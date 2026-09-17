import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { transformC02 } from "@/server/ingestion/c02";
import { loadOperationalSnapshot, normalizeSnapshot, readLinkedSnapshot } from "@/server/control-tower/loader";
import { buildTowerView, countFindings, evidenceLabels, missingLabels, provenanceLabels, propertyLabel } from "@/presentation/control-tower";
import { evaluateEvidence, MISSING_EVIDENCE } from "@/domain/evidence-engine";
import { EVIDENCE_CLASSIFICATIONS, DATA_PROVENANCE } from "@/domain/contracts";
import { EvidenceBadge, ProvenanceBadge } from "@/components/control-tower/badges";
import { CaseDetail } from "@/components/control-tower/case-detail";
import { DataState } from "@/components/control-tower/states";
import type { ClaimRecord, EventRecord } from "@/domain/operational-model";

let batch: Awaited<ReturnType<typeof transformC02>>;
beforeAll(async () => { batch = await transformC02(); });
const model = () => { const snapshot = normalizeSnapshot(batch); return buildTowerView(snapshot, evaluateEvidence(snapshot)); };
describe("trusted persisted snapshot mapping", () => {
  it("preserves all four jobs, fourteen claims, two events and their identifiers", async () => {
    const read = vi.fn(async () => batch);
    const snapshot = await loadOperationalSnapshot(read);
    expect(read).toHaveBeenCalledOnce();
    expect(snapshot.jobs.map(job => job.external_id)).toEqual(["W-1", "W-2", "W-3", "W-4"]);
    expect(snapshot.claims).toHaveLength(14); expect(snapshot.events).toHaveLength(2);
    expect(new Set(snapshot.claims.map(claim => claim.id))).toEqual(new Set(batch.claims.map(claim => claim.id)));
    expect(new Set(snapshot.events.map(event => event.id))).toEqual(new Set(batch.events.map(event => event.id)));
  });
  it("preserves SUPPLIED provenance, null claim dates and original clock-only times", () => {
    const snapshot = normalizeSnapshot(batch);
    expect([...snapshot.jobs, ...snapshot.claims, ...snapshot.events].every(row => row.provenance === "SUPPLIED")).toBe(true);
    expect(snapshot.claims.every(claim => claim.recorded_at === null && claim.effective_from === null)).toBe(true);
    expect(snapshot.events.map(event => [event.external_id, event.time_kind, event.occurred_at_raw, event.occurred_at]).sort()).toEqual([
      ["E-2", "clock", "08:50", null], ["R-1", "clock", "08:40", null],
    ]);
  });
  it("projects out unrelated persistence fields and never mutates its input", () => {
    const input = { jobs: batch.jobs.map(job => ({ ...job, created_at: "persistence-only" })), claims: batch.claims, events: batch.events };
    const before = JSON.stringify(input);
    expect(normalizeSnapshot(input).jobs[0]).not.toHaveProperty("created_at");
    expect(JSON.stringify(input)).toBe(before);
  });
  it("orders snapshots and view models deterministically across permutations", () => {
    const normal = normalizeSnapshot(batch);
    const shuffled = normalizeSnapshot({ jobs: [...batch.jobs].reverse(), claims: [...batch.claims].reverse(), events: [...batch.events].reverse() });
    expect(shuffled).toEqual(normal);
    expect(buildTowerView(shuffled, evaluateEvidence(shuffled))).toEqual(model());
  });
  it.each(["jobs", "claims", "events"])("rejects a missing %s collection instead of substituting demo data", key => {
    const input: Record<string, unknown> = { ...batch }; delete input[key];
    expect(() => normalizeSnapshot(input)).toThrow("INVALID_RECORDS");
  });
  it.each(["duplicate job", "orphan claim", "orphan event", "derived provenance", "invalid clock", "invented timestamp", "missing claim value"])("rejects invalid persisted data: %s", kind => {
    const input = structuredClone(batch);
    if (kind === "duplicate job") input.jobs.push(input.jobs[0]);
    if (kind === "orphan claim") input.claims[0].job_id = "absent";
    if (kind === "orphan event") input.events[0].job_id = "absent";
    if (kind === "derived provenance") Object.assign(input.claims[0], { provenance: "GENERATED" });
    if (kind === "invalid clock") input.events[0].occurred_at_raw = "25:40";
    if (kind === "invented timestamp") input.events[0].occurred_at = "2026-09-17T08:40:00Z";
    if (kind === "missing claim value") Object.assign(input.claims[0], { value: undefined });
    expect(() => normalizeSnapshot(input)).toThrow("INVALID_RECORDS");
  });
  it("fails closed in production before reading local credentials or running the CLI", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try { await expect(readLinkedSnapshot()).rejects.toThrow("ACCESS_CONFIGURATION"); }
    finally { vi.unstubAllEnvs(); }
  });
  it("propagates read failures without inventing a snapshot", async () => {
    await expect(loadOperationalSnapshot(async () => { throw Error("source unavailable"); })).rejects.toThrow("source unavailable");
  });
  it("handles an actual empty snapshot", () => {
    const empty = normalizeSnapshot({ jobs: [], claims: [], events: [] });
    expect(buildTowerView(empty, evaluateEvidence(empty))).toEqual({ cases: [], memories: [], jobs: 0, eventCount: 0, counts: { claims: 0, supported: 0, gaps: 0, conflicts: 0 } });
  });
});
describe("presentation summarizes frozen engine findings", () => {
  it("computes the real overview counts and preserves GENERATED provenance", () => {
    const data = model();
    expect(data.jobs).toBe(4); expect(data.eventCount).toBe(2);
    expect(data.counts).toEqual({ claims: 14, supported: 1, gaps: 13, conflicts: 0 });
    expect(data.cases.flatMap(item => item.findings).every(finding => finding.provenance === "GENERATED")).toBe(true);
    expect(data.cases.flatMap(item => item.findings)).toEqual(expect.arrayContaining(evaluateEvidence(normalizeSnapshot(batch))));
    expect(data.cases.every(item => !("classification" in item))).toBe(true);
  });
  it("preserves W-1's explicit reference relationship and three distinct claim assessments", () => {
    const item = model().cases[0]; const scan = item.events[0];
    expect(scan.external_id).toBe("R-1");
    const reference = item.claims.find(claim => claim.property === "receipt_ref")!;
    expect(reference.value).toBe(scan.external_id);
    expect(item.findings.find(finding => finding.subject.property === "receipt_ref")!.supporting_event_ids).toEqual([scan.id]);
    for (const property of ["stage", "part_receipt"]) expect(item.findings.find(finding => finding.subject.property === property)!.classification).toBe("INSUFFICIENT_EVIDENCE");
    expect(item.counts).toEqual({ claims: 4, supported: 1, gaps: 3, conflicts: 0 });
  });
  it("computes conflict counts from engine output rather than fixed C02 values", () => {
    const original = batch.claims.find(claim => claim.property === "device_state")!;
    const claim: ClaimRecord = { ...original, value: "online", source: "synthetic:unit", provenance: "SYNTHETIC", producer: "unit-test" };
    const event: EventRecord = { id: "unit-event", external_id: "unit-event", job_id: claim.job_id, source: claim.source,
      event_type: "device state confirmed: offline", time_kind: "unknown", occurred_at_raw: null, occurred_at: null, provenance: "SYNTHETIC", producer: "unit-test" };
    const findings = evaluateEvidence({ claims: [claim], events: [event], device_links: [{ claim_id: claim.id, event_id: event.id, scope: "same-device-same-assertion" }] });
    expect(countFindings(findings)).toEqual({ claims: 1, supported: 0, conflicts: 1, gaps: 0 });
  });
  it("preserves every missing-evidence code with a stable readable label", () => {
    expect(Object.keys(missingLabels).sort()).toEqual([...MISSING_EVIDENCE].sort());
    expect(missingLabels.PART_TO_JOB_HANDOFF_CONFIRMATION).toBe("Part-to-job or technician handoff confirmation");
    expect(missingLabels.APPROVAL_REQUEST_DISPATCH_CONFIRMATION).toBe("Approval request dispatch confirmation");
  });
  it.each(EVIDENCE_CLASSIFICATIONS)("renders accessible text for %s alongside its status icon", state => {
    const html = renderToStaticMarkup(<EvidenceBadge state={state} />);
    expect(html).toContain(evidenceLabels[state]); expect(html).toContain('aria-hidden="true"');
  });
  it.each(DATA_PROVENANCE)("renders the correct %s provenance label", value => {
    expect(renderToStaticMarkup(<ProvenanceBadge value={value} />)).toContain(provenanceLabels[value]);
  });
  it("formats unknown property names without inventing an evidence rule", () => { expect(propertyLabel("custom_property")).toBe("custom property"); });
  it.each([0, 1, 2, 3])("renders case %i with source claims, correct evidence and inspectable rule/version", index => {
    const item = model().cases[index]; const html = renderToStaticMarkup(<CaseDetail item={item} />);
    expect(html).toContain(item.job.external_id); expect(html).toContain("Recorded state"); expect(html).toContain("Evidence assessment");
    expect(html).toContain("Show me why"); expect(html).toContain("evidence-engine/c02/v1"); expect(html).toContain("deterministic-evidence-engine");
    for (const claim of item.claims) expect(html).toContain(claim.id);
    if (index < 2) expect(html).toContain(item.events[0].external_id);
    else expect(html).toContain("No independent events recorded");
    expect(html).not.toMatch(/BLOCKED|STALE|All systems operational|Live AI|confidence|Approve|Reject/);
  });
  it("renders real error and empty states without metrics or substituted jobs", () => {
    for (const kind of ["error", "empty"] as const) {
      const html = renderToStaticMarkup(<DataState kind={kind} />);
      expect(html).not.toContain("W-1"); expect(html).not.toContain("Jobs monitored");
      expect(html).toContain(kind === "error" ? "Retry loading records" : "No workshop records available");
    }
  });
});
