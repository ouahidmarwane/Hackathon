import { beforeAll, describe, expect, it } from "vitest";
import { transformC02 } from "@/server/ingestion/c02";
import { normalizeSnapshot, type OperationalSnapshot } from "@/server/control-tower/loader";
import { createDeterministicPlan } from "@/server/investigation/provider";
import { investigationPlanIdentity } from "@/server/investigation/plan-identity";
import { humanDecisionIdentity } from "@/server/decision/identity";
import {
  PROTOTYPE_REVIEWER, buildPlanForJob, recordHumanDecision, type DecisionRepository,
} from "@/server/decision/service";
import type { HumanDecision, HumanDecisionDraftWithId } from "@/domain/human-decision";
import { evaluateEvidence } from "@/domain/evidence-engine";

let snapshot: OperationalSnapshot;
let w1JobId: string;
beforeAll(async () => {
  snapshot = normalizeSnapshot(await transformC02());
  w1JobId = snapshot.jobs.find(job => job.external_id === "W-1")!.id;
});

class MemoryDecisionRepository implements DecisionRepository {
  records = new Map<string, HumanDecision>();
  constructor(private readonly clock: () => Date = () => new Date("2026-09-17T14:30:00Z")) {}
  async appendDecision(record: HumanDecisionDraftWithId) {
    const existing = this.records.get(record.id);
    if (existing) return existing;
    const stored: HumanDecision = { ...record, createdAt: this.clock().toISOString() };
    this.records.set(record.id, stored);
    return stored;
  }
}

const plan = () => buildPlanForJob(snapshot, w1JobId);
const approve = (planId = plan().id, next = plan().suggestedNextAction.text) => ({
  jobId: w1JobId, investigationPlanId: planId, decisionType: "APPROVED" as const,
  selectedNextStep: next,
});
const correct = (text: string) => ({
  jobId: w1JobId, investigationPlanId: plan().id, decisionType: "CORRECTED" as const,
  selectedNextStep: plan().suggestedNextAction.text, correctionText: text,
});

describe("stable investigation plan identity", () => {
  it("is deterministic and derived from job, provider, version and source references", () => {
    const input = plan();
    expect(plan().id).toBe(input.id);
    expect(plan().id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(input.id).not.toContain("finding:"); // opaque, not a rendered id
  });

  it("does not depend on input ordering", () => {
    const a = plan();
    const shuffled = createDeterministicPlan({
      job: snapshot.jobs.find(job => job.id === w1JobId)!,
      claims: [...snapshot.claims.filter(claim => claim.job_id === w1JobId)].reverse(),
      events: [...snapshot.events.filter(event => event.job_id === w1JobId)].reverse(),
      findings: [...evaluateEvidence({
        claims: snapshot.claims.filter(claim => claim.job_id === w1JobId),
        events: snapshot.events.filter(event => event.job_id === w1JobId),
      })].reverse(),
    });
    expect(shuffled.id).toBe(a.id);
  });

  it("changes when provider version or job changes", () => {
    const base = plan();
    expect(investigationPlanIdentity({ jobId: base.jobId, producer: base.producer, version: "investigation/c02/v2",
      sourceClaimIds: base.sourceClaimIds, sourceEventIds: base.sourceEventIds, sourceFindingIds: base.sourceFindingIds }))
      .not.toBe(base.id);
    expect(investigationPlanIdentity({ jobId: "other-job", producer: base.producer, version: base.version,
      sourceClaimIds: base.sourceClaimIds, sourceEventIds: base.sourceEventIds, sourceFindingIds: base.sourceFindingIds }))
      .not.toBe(base.id);
  });
});

describe("human decision identity", () => {
  it("is deterministic over reviewed content and differs for different decisions", () => {
    const first = recordDraft(approve());
    const second = recordDraft(correct("R-1 belongs to another work order."));
    expect(humanDecisionIdentity(first)).toBe(humanDecisionIdentity({ ...first }));
    expect(humanDecisionIdentity(first)).not.toBe(humanDecisionIdentity(second));
    expect(humanDecisionIdentity(first)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe("recordHumanDecision approval", () => {
  it("records an APPROVED decision with server-set provenance and preserved references", async () => {
    const repository = new MemoryDecisionRepository();
    const before = JSON.stringify(snapshot);
    const result = await recordHumanDecision(approve(), snapshot, repository);
    expect(result.provenance).toBe("HUMAN_VALIDATED");
    expect(result.reviewer).toBe(PROTOTYPE_REVIEWER);
    expect(result.decisionType).toBe("APPROVED");
    expect(result.correctionText).toBeNull();
    expect(result.sourceGeneratedPlanVersion).toBe("investigation/c02/v1");
    expect(result.sourceFindingIds).toEqual(plan().sourceFindingIds);
    expect(result.sourceClaimIds).toEqual(plan().sourceClaimIds);
    expect(result.sourceEventIds).toEqual(plan().sourceEventIds);
    expect(result.createdAt).toBe("2026-09-17T14:30:00.000Z");
    // No operational action, no source mutation, no new event.
    expect(plan().operationalAction).toBeNull();
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(snapshot.events).toHaveLength(2);
    expect(repository.records.size).toBe(1);
  });

  it("keeps the W-1 evidence gap and recorded stage unchanged after approval", async () => {
    const repository = new MemoryDecisionRepository();
    await recordHumanDecision(approve(), snapshot, repository);
    const after = plan();
    expect(after.missingEvidence.map(item => item.code)).toContain("PART_TO_JOB_HANDOFF_CONFIRMATION");
    expect(after.knownFacts.map(fact => fact.text)).toContain("Recorded Stage: Awaiting parts.");
    expect(after.abstention).toBe("No evidence-backed operational action can be proposed yet.");
    expect(snapshot.claims.find(claim => claim.job_id === w1JobId && claim.property === "stage")!.value)
      .toBe("awaiting parts");
  });

  it("does not create a workshop event or workflow change", async () => {
    const repository = new MemoryDecisionRepository();
    await recordHumanDecision(approve(), snapshot, repository);
    expect(snapshot.events).toHaveLength(2);
    expect(snapshot.jobs).toHaveLength(4);
    expect(snapshot.claims).toHaveLength(14);
  });
});

describe("recordHumanDecision correction", () => {
  it("stores a CORRECTED decision separately with HUMAN_VALIDATED provenance", async () => {
    const repository = new MemoryDecisionRepository();
    const result = await recordHumanDecision(correct("The scanned item belongs to another work order."), snapshot, repository);
    expect(result.decisionType).toBe("CORRECTED");
    expect(result.correctionText).toBe("The scanned item belongs to another work order.");
    expect(result.provenance).toBe("HUMAN_VALIDATED");
    expect(repository.records.size).toBe(1);
  });

  it("does not rewrite the R-1 source event, the M03 finding, or the generated plan", async () => {
    const repository = new MemoryDecisionRepository();
    const originalEvent = structuredClone(snapshot.events.find(event => event.external_id === "R-1"));
    const originalFindings = evaluateEvidence({ claims: snapshot.claims.filter(claim => claim.job_id === w1JobId), events: snapshot.events.filter(event => event.job_id === w1JobId) });
    const originalPlan = plan();
    await recordHumanDecision(correct("The scanned item belongs to another work order."), snapshot, repository);
    expect(snapshot.events.find(event => event.external_id === "R-1")).toEqual(originalEvent);
    expect(originalEvent).toMatchObject({ event_type: "part scan", provenance: "SUPPLIED" });
    expect(plan()).toEqual(originalPlan);
    expect(evaluateEvidence({ claims: snapshot.claims.filter(claim => claim.job_id === w1JobId), events: snapshot.events.filter(event => event.job_id === w1JobId) })).toEqual(originalFindings);
  });
});

describe("recordHumanDecision rejections", () => {
  it("rejects a decision for an unknown job", async () => {
    await expect(recordHumanDecision({ ...approve(), jobId: "00000000-0000-4000-8000-000000000099" }, snapshot, new MemoryDecisionRepository()))
      .rejects.toThrow(/Unknown work order/);
  });

  it("rejects a mismatched plan identity or reviewed next step", async () => {
    await expect(recordHumanDecision(approve("00000000-0000-4000-8000-000000000099"), snapshot, new MemoryDecisionRepository()))
      .rejects.toThrow(/no longer matches/);
    await expect(recordHumanDecision(approve(plan().id, "Invented next step"), snapshot, new MemoryDecisionRepository()))
      .rejects.toThrow(/no longer matches/);
  });

  it("rejects browser-supplied provenance or reviewer fields", async () => {
    await expect(recordHumanDecision({ ...approve(), provenance: "SUPPLIED" } as unknown, snapshot, new MemoryDecisionRepository()))
      .rejects.toThrow(/Unexpected/);
    await expect(recordHumanDecision({ ...approve(), reviewer: "Real manager" } as unknown, snapshot, new MemoryDecisionRepository()))
      .rejects.toThrow(/Unexpected/);
  });

  it("rejects malformed, control-character and oversized correction input", async () => {
    await expect(recordHumanDecision(correct("ok\nhidden"), snapshot, new MemoryDecisionRepository()))
      .rejects.toThrow(/control/);
    await expect(recordHumanDecision(correct("x".repeat(1001)), snapshot, new MemoryDecisionRepository()))
      .rejects.toThrow(/1000/);
  });
});

describe("duplicate and replay behavior", () => {
  it("treats an identical resubmission as a no-op without changing timestamps", async () => {
    const repository = new MemoryDecisionRepository();
    const first = await recordHumanDecision(approve(), snapshot, repository);
    const replay = await recordHumanDecision(approve(), snapshot, repository);
    expect(replay).toEqual(first);
    expect(repository.records.size).toBe(1);
  });

  it("keeps a later different decision as an additional linked record", async () => {
    const repository = new MemoryDecisionRepository();
    await recordHumanDecision(approve(), snapshot, repository);
    const later = await recordHumanDecision(correct("R-1 belongs to another work order."), snapshot, repository);
    expect(repository.records.size).toBe(2);
    expect(later.decisionType).toBe("CORRECTED");
  });
});

// Helper: builds the exact draft the service would persist, for identity tests.
function recordDraft(input: ReturnType<typeof approve> | ReturnType<typeof correct>): HumanDecisionDraftWithId {
  const generated = plan();
  return {
    id: "",
    jobId: generated.jobId,
    investigationPlanId: generated.id,
    decisionType: input.decisionType,
    selectedNextStep: generated.suggestedNextAction.text,
    correctionText: input.decisionType === "CORRECTED" ? input.correctionText : null,
    correctionReason: null,
    humanEvidenceReference: null,
    reviewer: PROTOTYPE_REVIEWER,
    provenance: "HUMAN_VALIDATED",
    sourceGeneratedPlanVersion: generated.version,
    sourceFindingIds: generated.sourceFindingIds,
    sourceClaimIds: generated.sourceClaimIds,
    sourceEventIds: generated.sourceEventIds,
  };
}
