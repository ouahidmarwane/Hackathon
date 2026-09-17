import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { SupabaseDecisionRepository } from "@/server/decision/supabase-repository";
import { PROTOTYPE_REVIEWER } from "@/server/decision/service";
import type { HumanDecisionDraftWithId } from "@/domain/human-decision";

function draft(overrides: Partial<HumanDecisionDraftWithId> = {}): HumanDecisionDraftWithId {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    jobId: "10000000-0000-4000-8000-000000000001",
    investigationPlanId: "10000000-0000-4000-8000-000000000002",
    decisionType: "APPROVED",
    selectedNextStep: "Confirm the part-to-job / technician handoff.",
    correctionText: null,
    correctionReason: null,
    humanEvidenceReference: null,
    reviewer: PROTOTYPE_REVIEWER,
    provenance: "HUMAN_VALIDATED",
    sourceGeneratedPlanVersion: "investigation/c02/v1",
    sourceFindingIds: ["finding:1"],
    sourceClaimIds: ["10000000-0000-4000-8000-000000000003"],
    sourceEventIds: ["10000000-0000-4000-8000-000000000004"],
    ...overrides,
  };
}

function repositoryWithResponses(responses: Response[]) {
  const fetch = vi.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request");
    return response;
  });
  const client = createClient("http://localhost:54321", "sb_secret_service_role_test", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch },
  });
  return { repository: new SupabaseDecisionRepository(client), fetch };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});
const storedRow = (overrides: Record<string, unknown> = {}) => ({
  id: "20000000-0000-4000-8000-000000000001",
  job_id: "10000000-0000-4000-8000-000000000001",
  investigation_plan_id: "10000000-0000-4000-8000-000000000002",
  decision_type: "APPROVED",
  selected_next_step: "Confirm the part-to-job / technician handoff.",
  correction_text: null,
  correction_reason: null,
  human_evidence_reference: null,
  reviewer: PROTOTYPE_REVIEWER,
  created_at: "2026-09-17T14:30:00+00:00",
  provenance: "HUMAN_VALIDATED",
  source_generated_plan_version: "investigation/c02/v1",
  source_finding_ids: ["finding:1"],
  source_claim_ids: ["10000000-0000-4000-8000-000000000003"],
  source_event_ids: ["10000000-0000-4000-8000-000000000004"],
  ...overrides,
});

describe("Supabase human decision adapter", () => {
  it("writes with ignore-duplicate semantics and never supplies created_at", async () => {
    const { repository, fetch } = repositoryWithResponses([
      new Response(null, { status: 201 }), json(storedRow()),
    ]);
    const result = await repository.appendDecision(draft());
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("/rest/v1/human_decisions");
    expect(String(url)).toContain("on_conflict=id");
    expect(new Headers(options.headers).get("Prefer")).toContain("resolution=ignore-duplicates");
    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("created_at");
    expect(body).toMatchObject({
      id: "20000000-0000-4000-8000-000000000001",
      job_id: "10000000-0000-4000-8000-000000000001",
      decision_type: "APPROVED",
      provenance: "HUMAN_VALIDATED",
      source_finding_ids: ["finding:1"],
      source_claim_ids: ["10000000-0000-4000-8000-000000000003"],
      source_event_ids: ["10000000-0000-4000-8000-000000000004"],
    });
    expect(result).toMatchObject({ id: draft().id, decisionType: "APPROVED", createdAt: "2026-09-17T14:30:00+00:00" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects conflicting stored decision content after a skipped insert", async () => {
    const { repository } = repositoryWithResponses([
      new Response(null, { status: 201 }),
      json(storedRow({ decision_type: "CORRECTED", correction_text: "other" })),
    ]);
    await expect(repository.appendDecision(draft())).rejects.toThrow(/Conflicting human decision identity/);
  });

  it("propagates RLS denial without returning a successful append", async () => {
    const { repository, fetch } = repositoryWithResponses([
      json({ code: "42501", message: "permission denied" }, 403),
    ]);
    await expect(repository.appendDecision(draft())).rejects.toThrow(/append failed/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fails if the stored decision cannot be verified", async () => {
    const { repository } = repositoryWithResponses([
      new Response(null, { status: 201 }), json({ code: "42501", message: "denied" }, 403),
    ]);
    await expect(repository.appendDecision(draft())).rejects.toThrow(/verification failed/);
  });

  it("accepts normalized timestamps and compares arrays without order dependence", async () => {
    const { repository } = repositoryWithResponses([
      new Response(null, { status: 201 }),
      json(storedRow({ created_at: "2026-09-17T14:30:00.000Z",
        source_finding_ids: ["finding:1"],
        source_claim_ids: ["10000000-0000-4000-8000-000000000003"],
        source_event_ids: ["10000000-0000-4000-8000-000000000004"] })),
    ]);
    await expect(repository.appendDecision(draft())).resolves.toMatchObject({ createdAt: "2026-09-17T14:30:00.000Z" });
  });
});
