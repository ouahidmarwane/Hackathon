import { describe, expect, it, vi, beforeEach } from "vitest";
import { transformC02 } from "@/server/ingestion/c02";
import { evaluateEvidence, type EvidenceFinding } from "@/domain/evidence-engine";
import { evaluateCasePriority } from "@/domain/prioritization";
import {
  evaluateNovaAlert,
  formatTelegramMessage,
  computeAlertFingerprint,
} from "@/domain/nova-alert";
import {
  sendTelegramAlert,
  clearAlertHistory,
} from "@/server/alerts/telegram";
import type { ClaimRecord, JobRecord } from "@/domain/operational-model";

describe("M10 — NOVA Alerts & Telegram Integration", () => {
  beforeEach(() => {
    clearAlertHistory();
    vi.unstubAllEnvs();
  });

  // 1. Meaningful current state generates a NOVA alert
  it("generates a structured NOVA alert for cases requiring review or with unresolved gaps", async () => {
    const batch = await transformC02();
    const findings = evaluateEvidence(batch);
    const w1Job = batch.jobs.find(j => j.external_id === "W-1")!;
    const w1Claims = batch.claims.filter(c => c.job_id === w1Job.id);
    const w1Findings = findings.filter(f => f.job_id === w1Job.id);
    const w1Events = batch.events.filter(e => e.job_id === w1Job.id);

    const priority = evaluateCasePriority({
      job: w1Job,
      claims: w1Claims,
      events: w1Events,
      findings: w1Findings,
      suggestedActionText: "Confirm the part-to-job / technician handoff before proposing a workflow status change.",
    });

    const alert = evaluateNovaAlert({
      job: w1Job,
      claims: w1Claims,
      events: w1Events,
      findings: w1Findings,
      priority,
      suggestedActionText: "Confirm the part-to-job / technician handoff before proposing a workflow status change.",
    });

    expect(alert).not.toBeNull();
    expect(alert!.jobId).toBe(w1Job.id);
    expect(alert!.externalJobId).toBe("W-1");
    expect(alert!.trigger).toBe("ACTIONABLE_EVIDENCE_GAP");
    expect(alert!.evidenceState).toBe("INSUFFICIENT_EVIDENCE");
    expect(alert!.unresolvedGaps).toContain("PART_TO_JOB_HANDOFF_CONFIRMATION");
    expect(alert!.producer).toBe("NOVA Operational Intelligence Agent");
    expect(alert!.suggestedAction).toContain("Confirm the part-to-job");
    expect(alert!.recordedState.stage).toBe("awaiting parts");
  });

  // 2. Non-actionable state does NOT generate an unnecessary alert
  it("does not generate an unnecessary alert when a work order is fully supported with no action required", () => {
    const job: JobRecord = { id: "job-clean", external_id: "W-CLEAN", source: "test", provenance: "SUPPLIED", producer: "test" };
    const claim: ClaimRecord = {
      id: "claim-clean", job_id: "job-clean", property: "stage", value: "ready",
      source: "test", source_record_ref: "rec", provenance: "SUPPLIED", producer: "test",
      recorded_at: null, effective_from: null,
    };
    const supportedFinding: EvidenceFinding = {
      id: "finding-clean", job_id: "job-clean",
      subject: { claim_id: "claim-clean", property: "stage", value: "ready" },
      classification: "SUPPORTED",
      source_claim_ids: ["claim-clean"],
      related_event_ids: [], supporting_event_ids: [], conflicting_event_ids: [],
      missing_evidence: [],
      rule_code: "CLAIM_GAP", rule_version: "evidence-engine/c02/v1", provenance: "GENERATED", producer: "deterministic-evidence-engine", depends_on_synthetic: false,
    };

    const priority = evaluateCasePriority({
      job,
      claims: [claim],
      events: [],
      findings: [supportedFinding],
    });

    const alert = evaluateNovaAlert({
      job,
      claims: [claim],
      events: [],
      findings: [supportedFinding],
      priority,
    });

    // Alert policy suppresses purely non-actionable cases
    expect(alert).toBeNull();
  });

  // 3. Telegram message is derived from server-side alert object without overclaiming
  it("formats a truthful Telegram message directly from the server-side alert without overclaiming", () => {
    const alert = {
      id: "test-alert-1",
      jobId: "job-w1",
      externalJobId: "W-1",
      trigger: "ACTIONABLE_EVIDENCE_GAP" as const,
      attentionLevel: "REVIEW" as const,
      headline: "Operational review required for Work Order W-1",
      recordedState: {
        stage: "awaiting parts",
        nextOwner: "technician",
      },
      relevantEvidence: [
        { externalId: "R-1", eventType: "part scan", provenance: "SUPPLIED", occurredAt: "08:40" },
      ],
      evidenceState: "INSUFFICIENT_EVIDENCE" as const,
      unresolvedGaps: ["PART_TO_JOB_HANDOFF_CONFIRMATION" as const],
      suggestedAction: "Confirm part-to-job handoff before moving vehicle.",
      reasons: ["Parts scan without handoff verification"],
      producer: "NOVA Operational Intelligence Agent" as const,
      version: "nova/m10/v1" as const,
      generatedAt: "2026-09-17T12:00:00Z",
    };

    const message = formatTelegramMessage(alert);

    expect(message).toContain("NOVA — Workshop Flow Intelligence");
    expect(message).toContain("Work Order W-1 requires review");
    expect(message).toContain("Recorded state:\nawaiting parts");
    expect(message).toContain("part scan [SUPPLIED] (08:40)");
    expect(message).toContain("Recommended next step:\nConfirm part-to-job handoff before moving vehicle.");
    expect(message).toContain("Evidence state: INSUFFICIENT EVIDENCE");
    expect(message).toContain("Human review required.");
    // Truthfulness: no fake timestamps or percentage score
    expect(message).not.toContain("95%");
    expect(message).not.toContain("Delayed by");
  });

  // 4. Missing Telegram configuration fails gracefully with NOT_CONFIGURED
  it("fails gracefully with NOT_CONFIGURED when Telegram environment variables are missing", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    const alert = {
      id: "fingerprint-1",
      jobId: "job-1",
      externalJobId: "W-1",
      trigger: "ACTIONABLE_EVIDENCE_GAP" as const,
      attentionLevel: "REVIEW" as const,
      headline: "Review W-1",
      recordedState: { stage: "awaiting parts", nextOwner: "not supplied" },
      relevantEvidence: [],
      evidenceState: "INSUFFICIENT_EVIDENCE" as const,
      unresolvedGaps: ["PART_TO_JOB_HANDOFF_CONFIRMATION" as const],
      suggestedAction: "Check part handoff",
      reasons: [],
      producer: "NOVA Operational Intelligence Agent" as const,
      version: "nova/m10/v1" as const,
      generatedAt: "2026-09-17T12:00:00Z",
    };

    const result = await sendTelegramAlert(alert);
    expect(result.status).toBe("NOT_CONFIGURED");
    if (result.status === "NOT_CONFIGURED") {
      expect(result.reason).toContain("not configured");
    }
  });

  // 5. Deterministic fingerprint and automatic deduplication
  it("computes deterministic fingerprints and deduplicates identical automatic alerts", async () => {
    const fp1 = computeAlertFingerprint({
      jobId: "job-1",
      trigger: "ACTIONABLE_EVIDENCE_GAP",
      stage: "awaiting parts",
      classifications: ["INSUFFICIENT_EVIDENCE"],
      missingCodes: ["PART_TO_JOB_HANDOFF_CONFIRMATION"],
      suggestedAction: "Verify handoff",
    });

    const fp2 = computeAlertFingerprint({
      jobId: "job-1",
      trigger: "ACTIONABLE_EVIDENCE_GAP",
      stage: "awaiting parts",
      classifications: ["INSUFFICIENT_EVIDENCE"],
      missingCodes: ["PART_TO_JOB_HANDOFF_CONFIRMATION"],
      suggestedAction: "Verify handoff",
    });

    // Identical inputs yield identical fingerprint regardless of execution time
    expect(fp1).toBe(fp2);
    expect(typeof fp1).toBe("string");
    expect(fp1.length).toBe(16);

    // Mock fetch for successful delivery
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-test-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "12345678");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 999, chat: { title: "Workshop Alerts" } } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const alert = {
      id: fp1,
      jobId: "job-1",
      externalJobId: "W-1",
      trigger: "ACTIONABLE_EVIDENCE_GAP" as const,
      attentionLevel: "REVIEW" as const,
      headline: "Review W-1",
      recordedState: { stage: "awaiting parts", nextOwner: "none" },
      relevantEvidence: [],
      evidenceState: "INSUFFICIENT_EVIDENCE" as const,
      unresolvedGaps: ["PART_TO_JOB_HANDOFF_CONFIRMATION" as const],
      suggestedAction: "Verify handoff",
      reasons: [],
      producer: "NOVA Operational Intelligence Agent" as const,
      version: "nova/m10/v1" as const,
      generatedAt: "2026-09-17T12:00:00Z",
    };

    // First automatic delivery succeeds
    const firstDelivery = await sendTelegramAlert(alert, { allowManualResend: false });
    expect(firstDelivery.status).toBe("DELIVERED");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second automatic delivery is deduplicated without calling fetch
    const secondDelivery = await sendTelegramAlert(alert, { allowManualResend: false });
    expect(secondDelivery.status).toBe("ALREADY_SENT");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
