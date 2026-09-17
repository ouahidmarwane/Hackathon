import { beforeAll, describe, expect, it, vi } from "vitest";
import { evaluateEvidence, EVIDENCE_RULE_VERSION, EVIDENCE_RULES, MISSING_EVIDENCE, type DeviceEvidenceLink, type EvidenceFinding } from "@/domain/evidence-engine";
import { EVIDENCE_CLASSIFICATIONS } from "@/domain/contracts";
import type { ClaimRecord, EventRecord } from "@/domain/operational-model";
import { transformC02 } from "@/server/ingestion/c02";

let batch: Awaited<ReturnType<typeof transformC02>>;
let findings: EvidenceFinding[];
beforeAll(async () => { batch = await transformC02(); findings = evaluateEvidence(batch); });
function result(job: string, property: string) {
  const id = batch.jobs.find(record => record.external_id === job)!.id;
  return findings.find(finding => finding.job_id === id && finding.subject.property === property)!;
}
const c02 = [
  ["W-1", "stage", "INSUFFICIENT_EVIDENCE", "R-1", ["PART_TO_JOB_HANDOFF_CONFIRMATION", "STAGE_CONFIRMATION"], "PART_HANDOFF_GAP"],
  ["W-1", "part_receipt", "INSUFFICIENT_EVIDENCE", "R-1", ["PART_RECEIPT_CONFIRMATION"], "PART_RECEIPT"],
  ["W-1", "receipt_ref", "SUPPORTED", "R-1", [], "RECEIPT_REFERENCE"],
  ["W-1", "next_owner", "INSUFFICIENT_EVIDENCE", null, ["OWNER_ASSIGNMENT_CONFIRMATION"], "CLAIM_GAP"],
  ["W-2", "stage", "INSUFFICIENT_EVIDENCE", "E-2", ["STAGE_CONFIRMATION"], "CLAIM_GAP"],
  ["W-2", "part", "INSUFFICIENT_EVIDENCE", null, ["PART_REQUIREMENT_CONFIRMATION"], "CLAIM_GAP"],
  ["W-2", "customer_approval", "INSUFFICIENT_EVIDENCE", "E-2", ["APPROVAL_REQUEST_DISPATCH_CONFIRMATION", "CUSTOMER_APPROVAL_RESPONSE"], "APPROVAL_GAP"],
  ["W-2", "next_owner", "INSUFFICIENT_EVIDENCE", null, ["OWNER_ASSIGNMENT_CONFIRMATION"], "CLAIM_GAP"],
  ["W-3", "stage", "INSUFFICIENT_EVIDENCE", null, ["QUALITY_CHECK_PROGRESS_CONFIRMATION"], "QUALITY_CHECK_GAP"],
  ["W-3", "device_state", "INSUFFICIENT_EVIDENCE", null, ["DEVICE_STATE_CONFIRMATION"], "CLAIM_GAP"],
  ["W-3", "next_owner", "INSUFFICIENT_EVIDENCE", null, ["OWNER_ASSIGNMENT_CONFIRMATION"], "CLAIM_GAP"],
  ["W-4", "stage", "INSUFFICIENT_EVIDENCE", null, ["OPERATIONAL_READINESS_CONFIRMATION"], "READINESS_GAP"],
  ["W-4", "customer_approval", "INSUFFICIENT_EVIDENCE", null, ["CUSTOMER_APPROVAL_RESPONSE"], "APPROVAL_GAP"],
  ["W-4", "next_owner", "INSUFFICIENT_EVIDENCE", null, ["OWNER_ASSIGNMENT_CONFIRMATION"], "CLAIM_GAP"],
] as const;

describe("supplied C02 claim reconciliation", () => {
  it.each(c02)("%s %s has the exact evidence finding", (job, property, classification, externalId, missing, rule) => {
    const finding = result(job, property);
    expect(finding.classification).toBe(classification);
    expect(finding.missing_evidence).toEqual([...missing]);
    expect(finding.rule_code).toBe(rule);
    expect(finding.related_event_ids).toEqual(externalId ? [batch.events.find(event => event.external_id === externalId)!.id] : []);
    expect(finding.conflicting_event_ids).toEqual([]);
    expect(finding.supporting_event_ids).toEqual(property === "receipt_ref" ? finding.related_event_ids : []);
  });
  it("produces one finding per recorded claim, with only canonical states and inspectable rules", () => {
    expect(findings).toHaveLength(14);
    expect(new Set(findings.map(finding => finding.subject.claim_id)).size).toBe(14);
    for (const finding of findings) {
      expect(EVIDENCE_CLASSIFICATIONS).toContain(finding.classification);
      expect(EVIDENCE_RULES[finding.rule_code]).toBeTruthy();
      expect(finding.rule_version).toBe(EVIDENCE_RULE_VERSION);
      expect(finding.provenance).toBe("GENERATED");
      expect(finding.producer).toBe("deterministic-evidence-engine");
      expect(finding.depends_on_synthetic).toBe(false);
      for (const code of finding.missing_evidence) expect(MISSING_EVIDENCE).toContain(code);
    }
  });
  it("traces R-1 through the receipt_ref source claim, not through text similarity", () => {
    const receiptRef = result("W-1", "receipt_ref").subject.claim_id;
    expect(result("W-1", "stage").source_claim_ids).toContain(receiptRef);
    expect(result("W-1", "part_receipt").source_claim_ids).toContain(receiptRef);
  });
  it("does not turn missing evidence, a scan, or preparation into conflict", () => {
    expect(findings.filter(finding => finding.classification === "CONFLICTING_EVIDENCE")).toEqual([]);
    expect(result("W-2", "customer_approval").supporting_event_ids).toEqual([]);
    expect(result("W-1", "stage").supporting_event_ids).toEqual([]);
  });
  it("contains no diagnoses, blame, duration, confidence, recommendations or inferred operational state", () => {
    for (const finding of findings) expect(Object.keys(finding).sort()).toEqual([
      "id", "job_id", "subject", "classification", "source_claim_ids", "related_event_ids", "supporting_event_ids",
      "conflicting_event_ids", "missing_evidence", "rule_code", "rule_version", "provenance", "producer", "depends_on_synthetic",
    ].sort());
    expect(JSON.stringify(findings)).not.toMatch(/BLOCKER|STALE|blame|caused|duration|confidence|sent.*true|technician.*true/);
  });
  it("preserves original claims, provenance, rules, and clock-only times", () => {
    const snapshot = JSON.stringify(batch);
    evaluateEvidence(batch);
    expect(JSON.stringify(batch)).toBe(snapshot);
    expect([...batch.jobs, ...batch.claims, ...batch.events].every(record => record.provenance === "SUPPLIED")).toBe(true);
    expect(batch.events.map(event => [event.external_id, event.time_kind, event.occurred_at_raw, event.occurred_at])).toEqual([
      ["R-1", "clock", "08:40", null], ["E-2", "clock", "08:50", null],
    ]);
  });
  it("works with frozen inputs, without clock or network access", () => {
    const claims = batch.claims.map(record => Object.freeze({ ...record }));
    const events = batch.events.map(record => Object.freeze({ ...record }));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw Error("Network forbidden"); });
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => { throw Error("Clock forbidden"); });
    try { expect(evaluateEvidence({ claims: Object.freeze(claims), events: Object.freeze(events) })).toEqual(findings); }
    finally { fetchSpy.mockRestore(); nowSpy.mockRestore(); }
  });
  it("is stable across repeated calls, input permutations and cloned inputs", () => {
    expect(evaluateEvidence(batch)).toEqual(findings);
    expect(evaluateEvidence({ claims: [...batch.claims].reverse(), events: [...batch.events].reverse() })).toEqual(findings);
    expect(evaluateEvidence(JSON.parse(JSON.stringify(batch)))).toEqual(findings);
    expect(new Set(findings.map(finding => finding.id)).size).toBe(14);
  });
  it.each(["missing reference", "other job", "other source", "wrong event type"])("does not link R-1 with %s", mode => {
    let claims = batch.claims.map(record => ({ ...record }));
    const events = batch.events.map(record => ({ ...record }));
    if (mode === "missing reference") claims = claims.filter(record => record.property !== "receipt_ref");
    if (mode === "other job") events[0].job_id = batch.jobs[1].id;
    if (mode === "other source") events[0].source = "synthetic:other";
    if (mode === "wrong event type") events[0].event_type = "part scan prepared";
    const finding = evaluateEvidence({ claims, events }).find(record => record.subject.claim_id === result("W-1", "stage").subject.claim_id)!;
    expect(finding.related_event_ids).toEqual([]);
    expect(finding.missing_evidence).toContain("RECEIPT_REFERENCE_RESOLUTION");
    expect(finding.classification).toBe("INSUFFICIENT_EVIDENCE");
  });
  it("does not choose between ambiguous receipt reference claims", () => {
    const reference = batch.claims.find(record => record.property === "receipt_ref")!;
    const alternate = { ...reference, id: "alternate-reference", value: "R-other" };
    const output = evaluateEvidence({ claims: [...batch.claims, alternate], events: batch.events });
    expect(output.find(record => record.subject.claim_id === result("W-1", "stage").subject.claim_id)!.related_event_ids).toEqual([]);
  });
  it("reports an unresolved receipt reference as insufficient rather than conflicting", () => {
    const output = evaluateEvidence({ claims: batch.claims, events: [] });
    const reference = output.find(record => record.subject.property === "receipt_ref")!;
    expect(reference.classification).toBe("INSUFFICIENT_EVIDENCE");
    expect(reference.missing_evidence).toEqual(["RECEIPT_REFERENCE_RESOLUTION"]);
    expect(reference.conflicting_event_ids).toEqual([]);
  });
  it("does not attach approval preparation across job or source boundaries", () => {
    for (const event of [{ ...batch.events[1], job_id: batch.jobs[0].id }, { ...batch.events[1], source: "synthetic:other" }]) {
      const output = evaluateEvidence({ claims: batch.claims, events: [event] });
      const approval = output.find(record => record.subject.claim_id === result("W-2", "customer_approval").subject.claim_id)!;
      expect(approval.related_event_ids).toEqual([]);
      expect(approval.missing_evidence).toEqual(["CUSTOMER_APPROVAL_RESPONSE"]);
    }
  });
  it("does not mark supplied findings as depending on unrelated synthetic evidence", () => {
    expect(evaluateEvidence({ claims: batch.claims, events: [...batch.events, observation("online")] })).toEqual(findings);
  });
  it("does not fabricate findings for absent approval fields", () => {
    expect(findings.filter(finding => finding.subject.property === "customer_approval")).toHaveLength(2);
  });
});

// These observations exist only in unit tests, never in C02 or Supabase.
const claim: ClaimRecord = {
  id: "test-claim", job_id: "test-job", source: "synthetic:unit", source_record_ref: "test-record",
  property: "device_state", value: "online", provenance: "SYNTHETIC", producer: "unit-test",
  recorded_at: null, effective_from: null,
};
function observation(value: string, id = "test-event"): EventRecord {
  return { id, job_id: claim.job_id, source: claim.source, external_id: id,
    event_type: `device state confirmed: ${value}`, provenance: "SYNTHETIC", producer: "unit-test",
    time_kind: "unknown", occurred_at_raw: null, occurred_at: null };
}
const link: DeviceEvidenceLink = { claim_id: claim.id, event_id: "test-event", scope: "same-device-same-assertion" };
describe("explicit device observation rules (test-only fixtures)", () => {
  it.each(["online", "offline"])("compares an explicitly scoped %s observation", value => {
    const event = observation(value);
    const finding = evaluateEvidence({ claims: [claim], events: [event], device_links: [link] })[0];
    expect(finding.classification).toBe(value === "online" ? "SUPPORTED" : "CONFLICTING_EVIDENCE");
    expect(finding.supporting_event_ids).toEqual(value === "online" ? [event.id] : []);
    expect(finding.conflicting_event_ids).toEqual(value === "offline" ? [event.id] : []);
    expect(finding.missing_evidence).toEqual([]);
    expect(finding.rule_code).toBe("DEVICE_OBSERVATION");
    expect(finding.depends_on_synthetic).toBe(true);
  });
  it("does not infer authoritative scope from an event label alone", () => {
    const finding = evaluateEvidence({ claims: [claim], events: [observation("offline")] })[0];
    expect(finding.classification).toBe("INSUFFICIENT_EVIDENCE");
    expect(finding.related_event_ids).toEqual([]);
  });
  it("supports an explicitly scoped offline assertion without diagnosing a blocker", () => {
    const finding = evaluateEvidence({ claims: [{ ...claim, value: "offline" }], events: [observation("offline")], device_links: [link] })[0];
    expect(finding.classification).toBe("SUPPORTED");
    expect(finding.subject.value).toBe("offline");
    expect(finding).not.toHaveProperty("diagnosis");
  });
  it("retains both stances and gives explicit conflict precedence without picking a latest event", () => {
    const events = [observation("online"), observation("offline", "other")];
    const links = [link, { ...link, event_id: "other" }];
    const input = { claims: [claim], events, device_links: links };
    const finding = evaluateEvidence(input)[0];
    expect(finding.classification).toBe("CONFLICTING_EVIDENCE");
    expect(finding.supporting_event_ids).toEqual(["test-event"]);
    expect(finding.conflicting_event_ids).toEqual(["other"]);
    expect(evaluateEvidence({ ...input, events: [...events].reverse(), device_links: [...links, link].reverse() })).toEqual([finding]);
  });
  it.each(["job", "source", "property", "value", "event type", "claim id", "event id", "scope"])("rejects invalid explicit link: %s", mode => {
    const c = { ...claim }; const e = observation("offline"); const l = { ...link };
    if (mode === "job") e.job_id = "other-job";
    if (mode === "source") e.source = "synthetic:other";
    if (mode === "property") c.property = "stage";
    if (mode === "value") c.value = "unspecified";
    if (mode === "event type") e.event_type = "device offline suspected";
    if (mode === "claim id") l.claim_id = "absent";
    if (mode === "event id") l.event_id = "absent";
    if (mode === "scope") Object.assign(l, { scope: "different-time" });
    expect(() => evaluateEvidence({ claims: [c], events: [e], device_links: [l] })).toThrow("Invalid scoped device evidence link");
  });
  it("changes logical identity when a conclusion or evidence dependency changes", () => {
    const insufficient = evaluateEvidence({ claims: [claim], events: [] })[0];
    const support = evaluateEvidence({ claims: [claim], events: [observation("online")], device_links: [link] })[0];
    const conflict = evaluateEvidence({ claims: [claim], events: [observation("offline")], device_links: [link] })[0];
    expect(new Set([insufficient.id, support.id, conflict.id]).size).toBe(3);
    expect(support.id).toContain(EVIDENCE_RULE_VERSION);
  });
  it.each(["GENERATED", "HUMAN_VALIDATED"])("rejects %s records as M02 source evidence", provenance => {
    const c = { ...claim }; Object.assign(c, { provenance });
    expect(() => evaluateEvidence({ claims: [c], events: [] })).toThrow("source provenance");
    const event = observation("online"); Object.assign(event, { provenance });
    expect(() => evaluateEvidence({ claims: [claim], events: [event] })).toThrow("source provenance");
  });
  it.each(["claim", "event", "natural event"])("rejects duplicate %s identities", kind => {
    const event = observation("online");
    expect(() => evaluateEvidence({
      claims: kind === "claim" ? [claim, claim] : [claim],
      events: kind === "event" ? [event, event] : kind === "natural event" ? [event, { ...event, id: "other" }] : [],
    })).toThrow(/Duplicate|Ambiguous/);
  });
  it("provides a generic evidence requirement for an unrecognized property", () => {
    const output = evaluateEvidence({ claims: [{ ...claim, property: "unrecognized" }], events: [] });
    expect(output[0].missing_evidence).toEqual(["CLAIM_VERIFICATION"]);
    expect(output[0].classification).toBe("INSUFFICIENT_EVIDENCE");
  });
  it("does not normalize unrecognized casing into a known stage", () => {
    const output = evaluateEvidence({ claims: [{ ...claim, property: "stage", value: "READY" }], events: [] });
    expect(output[0].rule_code).toBe("CLAIM_GAP");
    expect(output[0].missing_evidence).toEqual(["STAGE_CONFIRMATION"]);
  });
  it("accepts an empty snapshot", () => { expect(evaluateEvidence({ claims: [], events: [] })).toEqual([]); });
  it("rejects invented timestamps attached to clock-only records", () => {
    const event = { ...observation("online"), time_kind: "clock" as const, occurred_at_raw: "08:40", occurred_at: "2026-09-17T08:40:00Z" };
    expect(() => evaluateEvidence({ claims: [claim], events: [event] })).toThrow("Inconsistent event time");
  });
});
