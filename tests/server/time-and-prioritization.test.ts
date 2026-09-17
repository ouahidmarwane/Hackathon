import { describe, expect, it } from "vitest";
import { transformC02 } from "@/server/ingestion/c02";
import { evaluateEvidence, type EvidenceFinding } from "@/domain/evidence-engine";
import { evaluateJobTimeIntelligence } from "@/domain/time-intelligence";
import { evaluateCasePriority } from "@/domain/prioritization";
import type { ClaimRecord, EventRecord, JobRecord } from "@/domain/operational-model";

describe("M08 Time Intelligence & Transparent Prioritization", () => {
  // 1. No fabricated duration from clock-only evidence
  it("preserves clock-only source evidence without fabricating duration or SLA delay", async () => {
    const batch = await transformC02();
    const w1Job = batch.jobs.find(j => j.external_id === "W-1")!;
    const w3Job = batch.jobs.find(j => j.external_id === "W-3")!;

    // W-1 has supplied clock event R-1 = 08:40
    const w1Timing = evaluateJobTimeIntelligence(w1Job.id, batch.events);
    expect(w1Timing.state).toBe("PARTIAL");
    expect(w1Timing.timeKind).toBe("clock");
    expect(w1Timing.latestTimeRaw).toBe("08:40");
    expect(w1Timing.durationComputable).toBe(false);
    expect(w1Timing.notes.join(" ")).toContain("Not enough evidence to calculate duration");

    // W-3 has no event timing
    const w3Timing = evaluateJobTimeIntelligence(w3Job.id, batch.events);
    expect(w3Timing.state).toBe("UNAVAILABLE");
    expect(w3Timing.durationComputable).toBe(false);
  });

  // 2. Transparent priority factors (no magic numeric score)
  it("generates inspectable priority factors with labels and source references, without black-box scores", async () => {
    const batch = await transformC02();
    const findings = evaluateEvidence(batch);
    const w1Job = batch.jobs.find(j => j.external_id === "W-1")!;
    const w1Claims = batch.claims.filter(c => c.job_id === w1Job.id);
    const w1Findings = findings.filter(f => f.job_id === w1Job.id);

    const priority = evaluateCasePriority({
      job: w1Job,
      claims: w1Claims,
      events: batch.events.filter(e => e.job_id === w1Job.id),
      findings: w1Findings,
      suggestedActionText: "Confirm the part-to-job / technician handoff before proposing a workflow status change.",
    });

    // Attention category is inspectable
    expect(priority.level).toBe("REVIEW");
    expect(["IMMEDIATE_ATTENTION", "REVIEW", "MONITOR"]).toContain(priority.level);
    expect(priority).not.toHaveProperty("score");
    expect(priority).not.toHaveProperty("percentage");
    expect(JSON.stringify(priority)).not.toMatch(/score|confidence|risk_score|delayed_hours/);

    // Each factor is structured with type, label, reason, and source references
    expect(priority.factors.length).toBeGreaterThan(0);
    for (const factor of priority.factors) {
      expect(factor.type).toBeDefined();
      expect(factor.label.length).toBeGreaterThan(0);
      expect(factor.reason.length).toBeGreaterThan(0);
      expect(Array.isArray(factor.sourceRefs)).toBe(true);
    }
  });

  // 3. Conflict outranks ordinary evidence gap
  it("ranks conflicting evidence (IMMEDIATE_ATTENTION) higher than ordinary evidence gaps (REVIEW)", () => {
    const jobA: JobRecord = { id: "job-a", source: "test", external_id: "JOB-A", provenance: "SUPPLIED", producer: "test" };
    const jobB: JobRecord = { id: "job-b", source: "test", external_id: "JOB-B", provenance: "SUPPLIED", producer: "test" };
    const claimA: ClaimRecord = { id: "claim-a", job_id: "job-a", source: "test", source_record_ref: "rec-a", property: "stage", value: "repair paused", provenance: "SUPPLIED", producer: "test", recorded_at: null, effective_from: null };
    const claimB: ClaimRecord = { id: "claim-b", job_id: "job-b", source: "test", source_record_ref: "rec-b", property: "stage", value: "repair paused", provenance: "SUPPLIED", producer: "test", recorded_at: null, effective_from: null };

    const conflictFinding: EvidenceFinding = {
      id: "f-conflict", job_id: "job-a", subject: { claim_id: "claim-a", property: "stage", value: "repair paused" },
      classification: "CONFLICTING_EVIDENCE", source_claim_ids: ["claim-a"], related_event_ids: ["ev-1"],
      supporting_event_ids: [], conflicting_event_ids: ["ev-1"], missing_evidence: [],
      rule_code: "DEVICE_OBSERVATION", rule_version: "evidence-engine/c02/v1", provenance: "GENERATED", producer: "deterministic-evidence-engine", depends_on_synthetic: false,
    };
    const gapFinding: EvidenceFinding = {
      id: "f-gap", job_id: "job-b", subject: { claim_id: "claim-b", property: "stage", value: "repair paused" },
      classification: "INSUFFICIENT_EVIDENCE", source_claim_ids: ["claim-b"], related_event_ids: [],
      supporting_event_ids: [], conflicting_event_ids: [], missing_evidence: ["STAGE_CONFIRMATION"],
      rule_code: "CLAIM_GAP", rule_version: "evidence-engine/c02/v1", provenance: "GENERATED", producer: "deterministic-evidence-engine", depends_on_synthetic: false,
    };

    const priorityA = evaluateCasePriority({ job: jobA, claims: [claimA], events: [], findings: [conflictFinding] });
    const priorityB = evaluateCasePriority({ job: jobB, claims: [claimB], events: [], findings: [gapFinding] });

    expect(priorityA.level).toBe("IMMEDIATE_ATTENTION");
    expect(priorityB.level).toBe("REVIEW");
    expect(priorityA.rank).toBeLessThan(priorityB.rank); // lower rank number = higher priority
  });

  // 4. Synthetic timing clearly distinguished from supplied clock evidence
  it("clearly distinguishes synthetic timestamp from supplied clock-only timing", () => {
    const job: JobRecord = { id: "job-1", source: "test", external_id: "W-1", provenance: "SUPPLIED", producer: "test" };
    const suppliedClockEvent: EventRecord = {
      id: "ev-supplied", job_id: "job-1", source: "c02-supplied", external_id: "R-1",
      event_type: "part scan", provenance: "SUPPLIED", producer: "c02",
      time_kind: "clock", occurred_at_raw: "08:40", occurred_at: null,
    };
    const syntheticTimestampEvent: EventRecord = {
      id: "ev-synthetic", job_id: "job-1", source: "synthetic:demo", external_id: "SYN-1",
      event_type: "part handoff confirmed", provenance: "SYNTHETIC", producer: "simulator",
      time_kind: "timestamp", occurred_at_raw: "2026-09-17T15:30:00Z", occurred_at: "2026-09-17T15:30:00.000Z",
    };

    const clockTiming = evaluateJobTimeIntelligence("job-1", [suppliedClockEvent]);
    expect(clockTiming.state).toBe("PARTIAL");
    expect(clockTiming.provenance).toBe("SUPPLIED");
    expect(clockTiming.timeKind).toBe("clock");

    const syntheticTiming = evaluateJobTimeIntelligence("job-1", [syntheticTimestampEvent]);
    expect(syntheticTiming.state).toBe("AVAILABLE");
    expect(syntheticTiming.provenance).toBe("SYNTHETIC");
    expect(syntheticTiming.timeKind).toBe("timestamp");
    expect(syntheticTiming.latestTimeRaw).toBe("2026-09-17T15:30:00Z");
  });

  // 5. Deterministic ordering
  it("sorts cases deterministically without arbitrary percentages or random factors", async () => {
    const batch = await transformC02();
    const findings = evaluateEvidence(batch);

    const cases = batch.jobs.map(job => {
      const claims = batch.claims.filter(c => c.job_id === job.id);
      const jobFindings = findings.filter(f => f.job_id === job.id);
      const events = batch.events.filter(e => e.job_id === job.id);
      const priority = evaluateCasePriority({ job, claims, events, findings: jobFindings });
      return { job, priority };
    });

    const sorted1 = [...cases].sort((a, b) => a.priority.rank - b.priority.rank || a.job.external_id.localeCompare(b.job.external_id));
    const sorted2 = [...cases].reverse().sort((a, b) => a.priority.rank - b.priority.rank || a.job.external_id.localeCompare(b.job.external_id));

    expect(sorted1.map(c => c.job.external_id)).toEqual(sorted2.map(c => c.job.external_id));
    for (const c of sorted1) {
      expect(["IMMEDIATE_ATTENTION", "REVIEW", "MONITOR"]).toContain(c.priority.level);
    }
  });
});
