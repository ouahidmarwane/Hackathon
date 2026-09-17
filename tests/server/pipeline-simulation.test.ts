import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  PIPELINE_STAGES,
  type PipelineStage,
  type SimulationApprovalRecord,
  type SimulationClaimRecord,
  type SimulationEventRecord,
  type SimulationRunRecord,
  type SimulationRunStatus,
  type SimulationStageStatus,
} from "@/domain/pipeline-simulation";
import {
  approvePipelineTransition,
  confirmSimulationHandoff,
  startSimulationRun,
} from "@/server/simulation/service";
import type { SimulationRepository } from "@/server/simulation/repository";
import { isAuthorizedChat } from "@/server/alerts/telegram-inbound";

class MemorySimulationRepository implements SimulationRepository {
  runs = new Map<string, SimulationRunRecord>();
  claims: SimulationClaimRecord[] = [];
  events: SimulationEventRecord[] = [];
  approvals: SimulationApprovalRecord[] = [];
  private clock = () => new Date("2026-09-17T18:00:00Z");

  async getActiveRun() {
    const all = [...this.runs.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return all[0] ?? null;
  }
  async getRun(runId: string) {
    return (
      this.runs.get(runId) ??
      [...this.runs.values()].find((r) => r.external_id === runId) ??
      null
    );
  }
  async nextRunNumber() {
    return Math.max(0, ...[...this.runs.values()].map((r) => r.run_number)) + 1;
  }
  async createRun(run: SimulationRunRecord, claims: SimulationClaimRecord[]) {
    this.runs.set(run.id, structuredClone(run));
    this.claims.push(...claims.map((c) => structuredClone(c)));
  }
  async advanceStage(
    runId: string,
    fromStage: PipelineStage,
    nextStage: PipelineStage,
    stageStatus: SimulationStageStatus,
    runStatus: SimulationRunStatus,
    incidentActive: boolean,
  ) {
    const run = this.runs.get(runId);
    if (!run || run.current_stage !== fromStage) return null;
    run.current_stage = nextStage;
    run.stage_status = stageStatus;
    run.run_status = runStatus;
    run.incident_active = incidentActive;
    run.updated_at = this.clock().toISOString();
    return structuredClone(run);
  }
  async updateRunStatus(
    runId: string,
    stageStatus: SimulationStageStatus,
    runStatus: SimulationRunStatus,
    incidentActive: boolean,
  ) {
    const run = this.runs.get(runId);
    if (!run) return null;
    run.stage_status = stageStatus;
    run.run_status = runStatus;
    run.incident_active = incidentActive;
    run.updated_at = this.clock().toISOString();
    return structuredClone(run);
  }
  async completeRun(runId: string, fromStage: PipelineStage) {
    const run = this.runs.get(runId);
    if (!run || run.current_stage !== fromStage || run.run_status === "COMPLETED") return null;
    run.stage_status = "COMPLETED";
    run.run_status = "COMPLETED";
    run.incident_active = false;
    run.updated_at = this.clock().toISOString();
    return structuredClone(run);
  }
  async appendApproval(record: SimulationApprovalRecord) {
    if (!this.approvals.some((a) => a.id === record.id)) this.approvals.push(structuredClone(record));
  }
  async appendEvent(record: SimulationEventRecord) {
    if (!this.events.some((e) => e.id === record.id)) this.events.push(structuredClone(record));
  }
  async listApprovals(runId: string) {
    return this.approvals.filter((a) => a.run_id === runId);
  }
  async listClaims(runId: string) {
    return this.claims.filter((c) => c.run_id === runId);
  }
  async listEvents(runId: string) {
    return this.events.filter((e) => e.run_id === runId);
  }
}

async function startFresh(repo: MemorySimulationRepository) {
  const started = await startSimulationRun(repo);
  if (!started.ok) throw new Error(started.error);
  return started.state;
}

describe("M11 NOVA live workshop pipeline", () => {
  it("defines a linear 7-stage machine with no skipping", () => {
    expect(PIPELINE_STAGES).toEqual([
      "RECEPTION", "DIAGNOSIS", "PARTS_APPROVAL", "REPAIR", "QUALITY_CHECK", "READY", "COLLECTION",
    ]);
    expect(ALLOWED_TRANSITIONS.RECEPTION).toBe("DIAGNOSIS");
    expect(ALLOWED_TRANSITIONS.DIAGNOSIS).toBe("PARTS_APPROVAL");
    expect(ALLOWED_TRANSITIONS.PARTS_APPROVAL).toBe("REPAIR");
    expect(ALLOWED_TRANSITIONS.REPAIR).toBe("QUALITY_CHECK");
    expect(ALLOWED_TRANSITIONS.QUALITY_CHECK).toBe("READY");
    expect(ALLOWED_TRANSITIONS.READY).toBe("COLLECTION");
    expect(ALLOWED_TRANSITIONS.COLLECTION).toBeNull();
  });

  it("Web and Telegram advance through the SAME authoritative transition service", async () => {
    const repo = new MemorySimulationRepository();
    const initial = await startFresh(repo);
    expect(initial.currentStage).toBe("RECEPTION");

    const web = await approvePipelineTransition(repo, initial.runId, "WEB", "Manager");
    expect(web.ok).toBe(true);
    if (web.ok) expect(web.state.currentStage).toBe("DIAGNOSIS");

    const telegram = await approvePipelineTransition(repo, initial.runId, "TELEGRAM", "Manager");
    expect(telegram.ok).toBe(true);
    if (telegram.ok) expect(telegram.state.currentStage).toBe("PARTS_APPROVAL");

    // Channels are recorded, not used to pick a stage.
    expect(repo.approvals.map((a) => a.channel).sort()).toEqual(["TELEGRAM", "WEB"]);
    expect(repo.approvals.map((a) => a.from_stage)).toEqual(["RECEPTION", "DIAGNOSIS"]);
  });

  it("rejects commands from an unauthorized Telegram chat", () => {
    expect(isAuthorizedChat(123456, 123456)).toBe(true);
    expect(isAuthorizedChat(999999, 123456)).toBe(false);
    expect(isAuthorizedChat(123456, null)).toBe(false);
  });

  it("blocks progression at Parts / Approval until handoff evidence exists", async () => {
    const repo = new MemorySimulationRepository();
    const initial = await startFresh(repo);
    await approvePipelineTransition(repo, initial.runId, "WEB", "Manager"); // -> DIAGNOSIS
    const intoParts = await approvePipelineTransition(repo, initial.runId, "WEB", "Manager"); // -> PARTS_APPROVAL
    expect(intoParts.ok).toBe(true);
    if (!intoParts.ok) return;
    expect(intoParts.state.incidentActive).toBe(true);
    expect(intoParts.state.stageStatus).toBe("WAITING_FOR_EVIDENCE");

    const blocked = await approvePipelineTransition(repo, initial.runId, "WEB", "Manager");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("INCIDENT_UNRESOLVED");

    const resolved = await confirmSimulationHandoff(repo, initial.runId);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.state.incidentActive).toBe(false);
    expect(resolved.state.stageStatus).toBe("WAITING_FOR_APPROVAL");

    const approved = await approvePipelineTransition(repo, initial.runId, "TELEGRAM", "Manager");
    expect(approved.ok).toBe(true);
    if (approved.ok) expect(approved.state.currentStage).toBe("REPAIR");
  });

  it("does not advance twice on a duplicate (stale) approval", async () => {
    const repo = new MemorySimulationRepository();
    const initial = await startFresh(repo);
    const first = await approvePipelineTransition(repo, initial.runId, "WEB", "Manager");
    expect(first.ok).toBe(true);

    // A stale duplicate approval targeting the already-approved RECEPTION gate
    // must be a no-op: the conditional advance refuses to move a changed stage.
    const stale = await repo.advanceStage(initial.runId, "RECEPTION", "DIAGNOSIS", "WAITING_FOR_APPROVAL", "RUNNING", false);
    expect(stale).toBeNull();
    const state = await repo.getRun(initial.runId);
    expect(state?.current_stage).toBe("DIAGNOSIS");
    // Only one approval exists for the first gate.
    expect(repo.approvals).toHaveLength(1);
  });
});

