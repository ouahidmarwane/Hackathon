import { describe, expect, it } from "vitest";
import { transformC02 } from "@/server/ingestion/c02";
import { evaluateEvidence } from "@/domain/evidence-engine";
import {
  recallRelevantMemories,
  parseResolutionMemoryRecord,
  type ResolutionMemory,
} from "@/domain/resolution-memory";

describe("M09 Organizational Memory & Similar Incident Recall", () => {
  // 1. Only HUMAN_VALIDATED provenance is allowed for memories
  it("enforces HUMAN_VALIDATED provenance on resolution memory records", () => {
    const valid = parseResolutionMemoryRecord({
      id: "123e4567-e89b-12d3-a456-426614174000",
      jobId: "123e4567-e89b-12d3-a456-426614174001",
      externalJobId: "W-1",
      decisionId: null,
      stage: "awaiting parts",
      missingEvidenceCodes: ["PART_TO_JOB_HANDOFF_CONFIRMATION"],
      ruleCode: "EVIDENCE_GAP",
      category: "PARTS_HANDOFF",
      lesson: "Always verify physical handoff to technician.",
      sourceRefs: ["W-1", "R-1"],
      validatedBy: "Workshop Manager",
      provenance: "HUMAN_VALIDATED",
      createdAt: "2026-09-17T12:00:00Z",
    });
    expect(valid.provenance).toBe("HUMAN_VALIDATED");

    expect(() => {
      parseResolutionMemoryRecord({
        id: "123e4567-e89b-12d3-a456-426614174000",
        jobId: "123e4567-e89b-12d3-a456-426614174001",
        externalJobId: "W-1",
        stage: "awaiting parts",
        missingEvidenceCodes: [],
        lesson: "Invalid provenance memory.",
        validatedBy: "System",
        provenance: "GENERATED" as unknown as "HUMAN_VALIDATED",
        createdAt: "2026-09-17T12:00:00Z",
      });
    }).toThrow(/HUMAN_VALIDATED/);
  });

  // 2. Deterministic structured recall based on gap signatures
  it("recalls relevant past resolutions matching shared missing evidence gaps with explicit reasons", () => {
    const memory: ResolutionMemory = {
      id: "mem-1",
      jobId: "past-job-1",
      externalJobId: "PAST-W1",
      decisionId: "dec-1",
      stage: "awaiting parts",
      missingEvidenceCodes: ["PART_TO_JOB_HANDOFF_CONFIRMATION"],
      ruleCode: "PART_MISMATCH",
      category: "PARTS_HANDOFF",
      lesson: "Before treating a parts scan as evidence that the vehicle can progress, verify the part-to-job or technician handoff.",
      sourceRefs: ["PAST-W1"],
      validatedBy: "Senior Workshop Manager",
      provenance: "HUMAN_VALIDATED",
      createdAt: "2026-09-17T10:00:00Z",
    };

    // Case with matching gap PART_TO_JOB_HANDOFF_CONFIRMATION
    const matches = recallRelevantMemories(
      {
        jobId: "current-w1",
        missingCodes: ["PART_TO_JOB_HANDOFF_CONFIRMATION"],
        stage: "awaiting parts",
      },
      [memory],
    );

    expect(matches.length).toBe(1);
    expect(matches[0].memory.id).toBe("mem-1");
    expect(matches[0].relevanceReason).toContain("Both cases involve parts scan evidence without confirmed part-to-job handoff");
    expect(matches[0].matchedFactors).toContain("PART_TO_JOB_HANDOFF_CONFIRMATION");
    // No arbitrary score or percentage
    expect(matches[0]).not.toHaveProperty("similarityScore");
    expect(matches[0]).not.toHaveProperty("score");
  });

  // 3. Unrelated memories are not surfaced when signatures differ
  it("does not surface memories when evidence gaps and stages do not match", () => {
    const memory: ResolutionMemory = {
      id: "mem-parts",
      jobId: "past-w1",
      externalJobId: "W-1",
      decisionId: null,
      stage: "awaiting parts",
      missingEvidenceCodes: ["PART_TO_JOB_HANDOFF_CONFIRMATION"],
      ruleCode: "PARTS",
      category: "PARTS_HANDOFF",
      lesson: "Verify parts handoff.",
      sourceRefs: [],
      validatedBy: "Manager",
      provenance: "HUMAN_VALIDATED",
      createdAt: "2026-09-17T10:00:00Z",
    };

    // Current case is ready stage without parts gap
    const matches = recallRelevantMemories(
      {
        jobId: "current-w4",
        missingCodes: [],
        stage: "ready",
      },
      [memory],
    );

    expect(matches.length).toBe(0);
  });

  // 4. Past memory does not match the same active job
  it("filters out memories created for the same job to avoid trivial circular self-matches", () => {
    const memory: ResolutionMemory = {
      id: "mem-same",
      jobId: "job-123",
      externalJobId: "W-1",
      decisionId: null,
      stage: "awaiting parts",
      missingEvidenceCodes: ["PART_TO_JOB_HANDOFF_CONFIRMATION"],
      ruleCode: "PARTS",
      category: "PARTS_HANDOFF",
      lesson: "Verify handoff.",
      sourceRefs: [],
      validatedBy: "Manager",
      provenance: "HUMAN_VALIDATED",
      createdAt: "2026-09-17T10:00:00Z",
    };

    const matches = recallRelevantMemories(
      {
        jobId: "job-123",
        missingCodes: ["PART_TO_JOB_HANDOFF_CONFIRMATION"],
        stage: "awaiting parts",
      },
      [memory],
    );

    expect(matches.length).toBe(0);
  });

  // 5. Memory recall never mutates M03 evidence classifications or workshop claims
  it("leaves evidence findings and source claims completely unmutated when memories exist", async () => {
    const batch = await transformC02();
    const findingsBefore = evaluateEvidence(batch);

    const memory: ResolutionMemory = {
      id: "mem-advisor",
      jobId: "past-job",
      externalJobId: "W-99",
      decisionId: null,
      stage: "awaiting parts",
      missingEvidenceCodes: ["PART_TO_JOB_HANDOFF_CONFIRMATION"],
      ruleCode: "PARTS",
      category: "PARTS_HANDOFF",
      lesson: "Always verify technician handoff physically before moving vehicle.",
      sourceRefs: [],
      validatedBy: "Master Technician",
      provenance: "HUMAN_VALIDATED",
      createdAt: "2026-09-17T10:00:00Z",
    };

    const w1Job = batch.jobs.find(j => j.external_id === "W-1")!;
    const w1Claims = batch.claims.filter(c => c.job_id === w1Job.id);
    const w1Findings = findingsBefore.filter(f => f.job_id === w1Job.id);
    const w1MissingCodes = [...new Set(w1Findings.flatMap(f => f.missing_evidence))];

    const matches = recallRelevantMemories(
      {
        jobId: w1Job.id,
        missingCodes: w1MissingCodes,
        stage: "awaiting parts",
      },
      [memory],
    );

    expect(matches.length).toBeGreaterThan(0);

    // Re-evaluate evidence after recall
    const findingsAfter = evaluateEvidence(batch);

    // Classifications and missing codes remain 100% identical
    expect(findingsAfter).toEqual(findingsBefore);
    const w1FindingAfter = findingsAfter.find(f => f.job_id === w1Job.id && f.subject.property === "stage")!;
    expect(w1FindingAfter.classification).toBe("INSUFFICIENT_EVIDENCE");
    expect(w1FindingAfter.missing_evidence).toContain("PART_TO_JOB_HANDOFF_CONFIRMATION");

    // Workshop claims untouched
    const stageClaim = w1Claims.find(c => c.property === "stage")!;
    expect(stageClaim.value).toBe("awaiting parts");
    expect(stageClaim.provenance).toBe("SUPPLIED");
  });
});
