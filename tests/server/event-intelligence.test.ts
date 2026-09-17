import { describe, expect, it } from "vitest";
import { transformC02 } from "@/server/ingestion/c02";
import { ingestEvent, prepareEvent, type EventRepository, type ProducerContext } from "@/server/ingestion/events";
import { evaluateEvidence } from "@/domain/evidence-engine";
import { createDeterministicPlan } from "@/server/investigation/provider";
import { buildTowerView } from "@/presentation/control-tower";
import { buildWorkshopPipeline } from "@/presentation/workshop-pipeline";
import type { EventRecord, JobRecord, SourceRef } from "@/domain/operational-model";

class MemoryEventRepository implements EventRepository {
  private events: EventRecord[] = [];
  constructor(private jobs: JobRecord[]) {}

  async findJob(ref: SourceRef): Promise<JobRecord | null> {
    return this.jobs.find(j => j.source === ref.source && j.external_id === ref.external_id) ?? null;
  }

  async appendEvent(record: EventRecord): Promise<void> {
    const existing = this.events.find(e => e.id === record.id);
    if (existing) return;
    this.events.push(record);
  }

  getEvents(): EventRecord[] {
    return [...this.events];
  }
}

describe("M07 Event Intelligence & Automatic Reevaluation", () => {
  const syntheticContext: ProducerContext = {
    kind: "synthetic",
    source: "synthetic:demo",
    producer: "prototype demo",
  };

  const handoffInput = {
    job: { source: "c02-supplied", external_id: "W-1" },
    external_id: "SYN-HANDOFF-W1",
    event_type: "part handoff confirmed",
    provenance: "SYNTHETIC",
    time: { kind: "unknown" },
  };

  // 1. Ingestion: Valid synthetic event prepares and persists with SYNTHETIC provenance
  it("ingests and prepares a valid synthetic event with SYNTHETIC provenance", async () => {
    const batch = await transformC02();
    const repo = new MemoryEventRepository(batch.jobs);
    const event = await ingestEvent(handoffInput, syntheticContext, repo);

    expect(event.provenance).toBe("SYNTHETIC");
    expect(event.event_type).toBe("part handoff confirmed");
    expect(event.external_id).toBe("SYN-HANDOFF-W1");
    expect(event.source).toBe("synthetic:demo");
    expect(repo.getEvents()).toHaveLength(1);
    expect(repo.getEvents()[0].id).toBe(event.id);
  });

  // 2. Idempotency: Repeated injection does not duplicate records
  it("is idempotent across repeated ingestion calls", async () => {
    const batch = await transformC02();
    const repo = new MemoryEventRepository(batch.jobs);
    await ingestEvent(handoffInput, syntheticContext, repo);
    await ingestEvent(handoffInput, syntheticContext, repo);

    expect(repo.getEvents()).toHaveLength(1);
  });

  // 3. Security Boundary: Rejects browser intelligence or arbitrary fields
  it("rejects unauthorized classification, status, or unexpected fields", async () => {
    const batch = await transformC02();
    const repo = new MemoryEventRepository(batch.jobs);
    const taintedInput = {
      ...handoffInput,
      classification: "RESOLVED",
      status: "READY",
      intelligence: "override",
    };

    await expect(prepareEvent(taintedInput, syntheticContext, repo)).rejects.toThrow("Unexpected input field");
  });

  // 4. M03 Reevaluation: Clears PART_TO_JOB_HANDOFF_CONFIRMATION, leaves STAGE_CONFIRMATION
  it("reevaluates M03 evidence: clears handoff gap, keeps stage confirmation, flags synthetic dependency", async () => {
    const batch = await transformC02();
    const repo = new MemoryEventRepository(batch.jobs);
    const handoffEvent = await prepareEvent(handoffInput, syntheticContext, repo);

    const findingsBefore = evaluateEvidence(batch);
    const w1StageBefore = findingsBefore.find(
      f => f.job_id === batch.jobs[0].id && f.subject.property === "stage",
    )!;
    expect(w1StageBefore.missing_evidence).toEqual([
      "PART_TO_JOB_HANDOFF_CONFIRMATION",
      "STAGE_CONFIRMATION",
    ]);
    expect(w1StageBefore.depends_on_synthetic).toBe(false);

    const snapshotAfter = {
      claims: batch.claims,
      events: [...batch.events, handoffEvent],
    };
    const findingsAfter = evaluateEvidence(snapshotAfter);
    const w1StageAfter = findingsAfter.find(
      f => f.job_id === batch.jobs[0].id && f.subject.property === "stage",
    )!;

    // Clears PART_TO_JOB_HANDOFF_CONFIRMATION, leaves STAGE_CONFIRMATION
    expect(w1StageAfter.missing_evidence).toEqual(["STAGE_CONFIRMATION"]);
    expect(w1StageAfter.classification).toBe("INSUFFICIENT_EVIDENCE");
    expect(w1StageAfter.depends_on_synthetic).toBe(true);
    expect(w1StageAfter.related_event_ids).toContain(handoffEvent.id);
  });

  // 5. M05 Reevaluation & Pipeline: Transitions suggested next step and places event in pipeline
  it("transitions M05 suggested next step to stage confirmation and places event in Parts/Approval pipeline stage", async () => {
    const batch = await transformC02();
    const repo = new MemoryEventRepository(batch.jobs);
    const handoffEvent = await prepareEvent(handoffInput, syntheticContext, repo);

    const snapshotAfter = {
      jobs: batch.jobs,
      claims: batch.claims,
      events: [...batch.events, handoffEvent],
    };
    const tower = buildTowerView(snapshotAfter, evaluateEvidence(snapshotAfter));
    const w1Case = tower.cases.find(c => c.job.external_id === "W-1")!;

    // M05 plan regeneration
    const plan = createDeterministicPlan(w1Case);
    expect(plan.suggestedNextAction.text).toBe(
      "Confirm the work order's current operational stage in the authoritative workflow source.",
    );
    expect(plan.suggestedNextAction.trace.missingEvidenceCodes).toEqual(["STAGE_CONFIRMATION"]);
    expect(plan.dependsOnSynthetic).toBe(true);

    // Workshop pipeline placement
    const pipeline = buildWorkshopPipeline(w1Case);
    const partsApprovalStage = pipeline.stages.find(s => s.id === "parts-approval")!;
    expect(partsApprovalStage.events.some(e => e.event_ref === "SYN-HANDOFF-W1")).toBe(true);
  });
});

