import { beforeAll, describe, expect, it, vi } from "vitest";
import { transformC02 } from "@/server/ingestion/c02";
import { normalizeDecisions, normalizeSnapshot, loadOperationalWorkspace } from "@/server/control-tower/loader";
import { WorkshopReadError } from "@/server/control-tower/loader";

let batch: Awaited<ReturnType<typeof transformC02>>;
beforeAll(async () => { batch = await transformC02(); });

const decision = (id: string, createdAt: string) => ({
  id, jobId: "10000000-0000-4000-8000-000000000001",
  investigationPlanId: "10000000-0000-4000-8000-000000000002",
  decisionType: "APPROVED", selectedNextStep: "Confirm handoff.",
  correctionText: null, correctionReason: null, humanEvidenceReference: null,
  reviewer: "Prototype reviewer", createdAt, provenance: "HUMAN_VALIDATED",
  sourceGeneratedPlanVersion: "investigation/c02/v1",
  sourceFindingIds: ["finding:1"], sourceClaimIds: ["10000000-0000-4000-8000-000000000003"],
  sourceEventIds: ["10000000-0000-4000-8000-000000000004"],
});

describe("persisted decision read path", () => {
  it("returns an empty history when no decisions key is present", () => {
    expect(normalizeDecisions(batch)).toEqual([]);
  });

  it("orders decisions by their persisted creation timestamp", () => {
    const first = decision("20000000-0000-4000-8000-000000000001", "2026-09-17T14:30:00.000Z");
    const second = decision("20000000-0000-4000-8000-000000000002", "2026-09-17T14:31:00.000Z");
    expect(normalizeDecisions({ decisions: [second, first] }).map(row => row.id))
      .toEqual([first.id, second.id]);
  });

  it("fails the whole read closed on invalid decision rows", () => {
    expect(() => normalizeDecisions({ decisions: [{ ...decision("x", "not-a-date") }] }))
      .toThrow(WorkshopReadError);
    expect(() => normalizeDecisions({ decisions: [{ ...decision("20000000-0000-4000-8000-000000000001", "2026-09-17T14:30:00.000Z"), provenance: "GENERATED" }] }))
      .toThrow(WorkshopReadError);
  });

  it("loads a workspace with snapshot and decisions in a single read", async () => {
    const row = decision("20000000-0000-4000-8000-000000000001", "2026-09-17T14:30:00.000Z");
    const reader = vi.fn(async () => ({ ...batch, decisions: [row] }));
    const workspace = await loadOperationalWorkspace(reader);
    expect(reader).toHaveBeenCalledOnce();
    expect(workspace.snapshot.jobs.map(job => job.external_id)).toEqual(["W-1", "W-2", "W-3", "W-4"]);
    expect(workspace.decisions).toEqual([row]);
    expect(normalizeSnapshot(batch).jobs.map(job => job.id)).toEqual(workspace.snapshot.jobs.map(job => job.id));
  });

  describe("regression: independent degradation and fail-closed boundaries", () => {
    it("regression: core data available + decisions available", async () => {
      const row = decision("20000000-0000-4000-8000-000000000001", "2026-09-17T14:30:00.000Z");
      const coreReader = vi.fn(async () => batch);
      const decisionsReader = vi.fn(async () => [row]);
      const workspace = await loadOperationalWorkspace(coreReader, decisionsReader);

      expect(workspace.snapshot.jobs).toHaveLength(4);
      expect(workspace.snapshot.claims).toHaveLength(14);
      expect(workspace.snapshot.events).toHaveLength(2);
      expect(workspace.decisions).toEqual([row]);
    });

    it("regression: core data available + decisions unavailable (graceful degradation)", async () => {
      const coreReader = vi.fn(async () => batch);
      // Simulates human_decisions table or reader throwing (e.g. relation does not exist)
      const failingDecisionsReader = vi.fn(async () => {
        throw new Error("ERROR: 42P01: relation \"public.human_decisions\" does not exist");
      });
      // Decisions reader throwing (e.g. relation does not exist) degrades decisions to empty without failing core snapshot
      const workspace = await loadOperationalWorkspace(coreReader, failingDecisionsReader);

      expect(workspace.snapshot.jobs).toHaveLength(4);
      expect(workspace.snapshot.claims).toHaveLength(14);
      expect(workspace.snapshot.events).toHaveLength(2);
      expect(workspace.decisions).toEqual([]);
    });

    it("regression: missing service-role key degrades write path safely while read path works", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
      try {
        const { getSupabaseAdminConfig } = await import("@/lib/supabase/admin");
        expect(() => getSupabaseAdminConfig()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);

        const { submitHumanDecision } = await import("@/server/decision/actions");
        const result = await submitHumanDecision({
          jobId: batch.jobs[0].id,
          investigationPlanId: "10000000-0000-4000-8000-000000000002",
          decisionType: "APPROVED",
          selectedNextStep: "Confirm handoff.",
        });
        expect(result).toEqual({ ok: false, error: "The decision could not be recorded." });
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("regression: empty decision history returns empty list without affecting core records", async () => {
      const coreReader = vi.fn(async () => ({ ...batch, decisions: [] }));
      const workspace = await loadOperationalWorkspace(coreReader);

      expect(workspace.snapshot.jobs).toHaveLength(4);
      expect(workspace.snapshot.claims).toHaveLength(14);
      expect(workspace.snapshot.events).toHaveLength(2);
      expect(workspace.decisions).toEqual([]);
    });

    it("regression: actual core source failure fails closed without swallowing", async () => {
      const failingCoreReader = vi.fn(async () => {
        throw new Error("PostgreSQL connection terminated unexpectedly");
      });
      await expect(loadOperationalWorkspace(failingCoreReader)).rejects.toThrow(
        "PostgreSQL connection terminated unexpectedly",
      );

      const invalidCoreReader = vi.fn(async () => ({ jobs: [], claims: "corrupted", events: [] }));
      await expect(loadOperationalWorkspace(invalidCoreReader)).rejects.toThrow(WorkshopReadError);
    });

    it.skipIf(process.env.RUN_LIVE_TESTS !== "1")("regression: live loadOperationalWorkspace returns 4 jobs, 14 claims, 2 events and degrades decisions to []", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://hmyftkbcbktoccimkaui.supabase.co");
      try {
        const workspace = await loadOperationalWorkspace();
        expect(workspace.snapshot.jobs).toHaveLength(4);
        expect(workspace.snapshot.claims).toHaveLength(14);
        expect(workspace.snapshot.events).toHaveLength(2);

        const stagesByJob = new Map<string, string>();
        for (const claim of workspace.snapshot.claims) {
          if (claim.property === "stage") {
            const job = workspace.snapshot.jobs.find(j => j.id === claim.job_id);
            if (job) stagesByJob.set(job.external_id, claim.value);
          }
        }
        expect(stagesByJob.get("W-1")).toBe("awaiting parts");
        expect(stagesByJob.get("W-2")).toBe("repair paused");
        expect(stagesByJob.get("W-3")).toBe("quality check");
        expect(stagesByJob.get("W-4")).toBe("ready");

        // Decisions degrade independently or contain valid persisted decisions
        expect(Array.isArray(workspace.decisions)).toBe(true);
        for (const decision of workspace.decisions) {
          expect(decision.provenance).toBe("HUMAN_VALIDATED");
        }
      } finally {
        vi.unstubAllEnvs();
      }
    }, 25_000);
  });
});
