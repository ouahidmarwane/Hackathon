import { beforeAll, describe, expect, it, vi } from "vitest";
import { readLinkedSnapshot, normalizeSnapshot } from "@/server/control-tower/loader";
import { buildPlanForJob } from "@/server/decision/service";
import { submitHumanDecision } from "@/server/decision/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

describe("live end-to-end M06 approve and correct verification", () => {
  let w1JobId: string;
  let w1PlanId: string;
  let suggestedNextStep: string;
  let adminClient: ReturnType<typeof createSupabaseAdminClient>;

  beforeAll(async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync(".env.local", "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1].trim()]) {
        process.env[match[1].trim()] = match[2].trim();
      }
    }
    vi.stubEnv("NODE_ENV", "development");
    const raw = await readLinkedSnapshot();
    const snapshot = normalizeSnapshot(raw);
    const w1 = snapshot.jobs.find((j) => j.external_id === "W-1")!;
    w1JobId = w1.id;
    const plan = buildPlanForJob(snapshot, w1JobId);
    w1PlanId = plan.id;
    suggestedNextStep = plan.suggestedNextAction.text;
    adminClient = createSupabaseAdminClient();
  });

  it("executes the live W-1 approve flow, persisting to human_decisions with HUMAN_VALIDATED", async () => {
    const result = await submitHumanDecision({
      jobId: w1JobId,
      investigationPlanId: w1PlanId,
      decisionType: "APPROVED",
      selectedNextStep: suggestedNextStep,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.decision.decisionType).toBe("APPROVED");
    expect(result.decision.provenance).toBe("HUMAN_VALIDATED");
    expect(result.decision.jobId).toBe(w1JobId);
    expect(result.decision.investigationPlanId).toBe(w1PlanId);

    // Verify row in remote DB
    const { data, error } = await adminClient
      .from("human_decisions")
      .select("*")
      .eq("id", result.decision.id)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.decision_type).toBe("APPROVED");
    expect(data.provenance).toBe("HUMAN_VALIDATED");
  }, 25_000);

  it("executes the live W-1 correct flow with prototype text without mutating source records", async () => {
    const correctionMessage = "R-1 part scan belongs to another job. Confirmed with intake.";
    const result = await submitHumanDecision({
      jobId: w1JobId,
      investigationPlanId: w1PlanId,
      decisionType: "CORRECTED",
      selectedNextStep: suggestedNextStep,
      correctionText: correctionMessage,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.decision.decisionType).toBe("CORRECTED");
    expect(result.decision.provenance).toBe("HUMAN_VALIDATED");
    expect(result.decision.correctionText).toBe(correctionMessage);

    // Verify row in remote DB
    const { data, error } = await adminClient
      .from("human_decisions")
      .select("*")
      .eq("id", result.decision.id)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.decision_type).toBe("CORRECTED");
    expect(data.correction_text).toBe(correctionMessage);
    expect(data.provenance).toBe("HUMAN_VALIDATED");
  }, 25_000);

  it("verifies workshop state, evidence gap, and C02 records remain intact", async () => {
    const raw = await readLinkedSnapshot();
    const snapshot = normalizeSnapshot(raw);
    const w1 = snapshot.jobs.find((j) => j.external_id === "W-1")!;

    // 1. W-1 remains Awaiting parts
    const stageClaim = snapshot.claims.find(
      (c) => c.job_id === w1.id && c.property === "stage",
    );
    expect(stageClaim?.value).toBe("awaiting parts");

    // 2. Total counts unchanged
    expect(snapshot.jobs).toHaveLength(4);
    expect(snapshot.claims).toHaveLength(14);
    expect(snapshot.events).toHaveLength(2);

    // 3. R-1 source event unchanged (SUPPLIED, not modified by human correction)
    const r1 = snapshot.events.find((e) => e.external_id === "R-1")!;
    expect(r1.provenance).toBe("SUPPLIED");
    expect(r1.event_type).toBe("part scan");

    // 4. Evidence gap remains on W-1 plan
    const plan = buildPlanForJob(snapshot, w1.id);
    expect(plan.missingEvidence.map((m) => m.code)).toContain(
      "PART_TO_JOB_HANDOFF_CONFIRMATION",
    );
    expect(plan.operationalAction).toBeNull();
  }, 25_000);
});
