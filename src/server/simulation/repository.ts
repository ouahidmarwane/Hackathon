import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PipelineStage,
  SimulationApprovalRecord,
  SimulationClaimRecord,
  SimulationEventRecord,
  SimulationRunRecord,
  SimulationRunStatus,
  SimulationStageStatus,
} from "@/domain/pipeline-simulation";

export interface SimulationRepository {
  getActiveRun(): Promise<SimulationRunRecord | null>;
  getRun(runId: string): Promise<SimulationRunRecord | null>;
  nextRunNumber(): Promise<number>;
  createRun(
    run: SimulationRunRecord,
    claims: SimulationClaimRecord[],
  ): Promise<void>;
  /** Conditional advance: only if current_stage still equals fromStage.
   * Returns the updated run, or null if the stage already changed. */
  advanceStage(
    runId: string,
    fromStage: PipelineStage,
    nextStage: PipelineStage,
    stageStatus: SimulationStageStatus,
    runStatus: SimulationRunStatus,
    incidentActive: boolean,
  ): Promise<SimulationRunRecord | null>;
  updateRunStatus(
    runId: string,
    stageStatus: SimulationStageStatus,
    runStatus: SimulationRunStatus,
    incidentActive: boolean,
  ): Promise<SimulationRunRecord | null>;
  completeRun(runId: string, fromStage: PipelineStage): Promise<SimulationRunRecord | null>;
  appendApproval(record: SimulationApprovalRecord): Promise<void>;
  appendEvent(record: SimulationEventRecord): Promise<void>;
  listApprovals(runId: string): Promise<SimulationApprovalRecord[]>;
  listClaims(runId: string): Promise<SimulationClaimRecord[]>;
  listEvents(runId: string): Promise<SimulationEventRecord[]>;
}

/** Injected privileged (service-role) client only. The M11 migration grants
 * service_role narrow INSERT/SELECT on the simulation tables and nothing else. */
export class SupabaseSimulationRepository implements SimulationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getActiveRun(): Promise<SimulationRunRecord | null> {
    const { data, error } = await this.client.from("simulation_runs")
      .select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Simulation run lookup failed.");
    return (data as SimulationRunRecord | null) ?? null;
  }

  async getRun(runId: string): Promise<SimulationRunRecord | null> {
    const byId = await this.client.from("simulation_runs")
      .select("*").eq("id", runId).maybeSingle();
    if (byId.error) throw new Error("Simulation run lookup failed.");
    if (byId.data) return byId.data as SimulationRunRecord;
    const byExternal = await this.client.from("simulation_runs")
      .select("*").eq("external_id", runId).maybeSingle();
    if (byExternal.error) throw new Error("Simulation run lookup failed.");
    return (byExternal.data as SimulationRunRecord | null) ?? null;
  }

  async nextRunNumber(): Promise<number> {
    const { data, error } = await this.client.from("simulation_runs")
      .select("run_number").order("run_number", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Simulation run number lookup failed.");
    return ((data as { run_number: number } | null)?.run_number ?? 0) + 1;
  }

  async createRun(
    run: SimulationRunRecord,
    claims: SimulationClaimRecord[],
  ): Promise<void> {
    const { error } = await this.client.from("simulation_runs").insert(run);
    if (error) throw new Error("Simulation run creation failed.");
    const { error: claimError } = await this.client.from("simulation_claims").insert(claims);
    if (claimError) throw new Error("Simulation claim creation failed.");
  }

  async advanceStage(
    runId: string,
    fromStage: PipelineStage,
    nextStage: PipelineStage,
    stageStatus: SimulationStageStatus,
    runStatus: SimulationRunStatus,
    incidentActive: boolean,
  ): Promise<SimulationRunRecord | null> {
    const { data, error } = await this.client.from("simulation_runs")
      .update({
        current_stage: nextStage,
        stage_status: stageStatus,
        run_status: runStatus,
        incident_active: incidentActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId).eq("current_stage", fromStage)
      .select("*").maybeSingle();
    if (error) throw new Error("Simulation stage advance failed.");
    return (data as SimulationRunRecord | null) ?? null;
  }

  async updateRunStatus(
    runId: string,
    stageStatus: SimulationStageStatus,
    runStatus: SimulationRunStatus,
    incidentActive: boolean,
  ): Promise<SimulationRunRecord | null> {
    const { data, error } = await this.client.from("simulation_runs")
      .update({
        stage_status: stageStatus,
        run_status: runStatus,
        incident_active: incidentActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .select("*").maybeSingle();
    if (error) throw new Error("Simulation status update failed.");
    return (data as SimulationRunRecord | null) ?? null;
  }

  async completeRun(runId: string, fromStage: PipelineStage): Promise<SimulationRunRecord | null> {
    const { data, error } = await this.client.from("simulation_runs")
      .update({
        stage_status: "COMPLETED",
        run_status: "COMPLETED",
        incident_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId).eq("current_stage", fromStage).neq("run_status", "COMPLETED")
      .select("*").maybeSingle();
    if (error) throw new Error("Simulation completion failed.");
    return (data as SimulationRunRecord | null) ?? null;
  }

  async appendApproval(record: SimulationApprovalRecord): Promise<void> {
    const { error } = await this.client.from("simulation_approvals")
      .upsert(record, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error("Simulation approval append failed.");
  }

  async appendEvent(record: SimulationEventRecord): Promise<void> {
    const { error } = await this.client.from("simulation_events")
      .upsert(record, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error("Simulation event append failed.");
  }

  async listApprovals(runId: string): Promise<SimulationApprovalRecord[]> {
    const { data, error } = await this.client.from("simulation_approvals")
      .select("*").eq("run_id", runId).order("created_at", { ascending: true });
    if (error) throw new Error("Simulation approval read failed.");
    return (data as SimulationApprovalRecord[]) ?? [];
  }

  async listClaims(runId: string): Promise<SimulationClaimRecord[]> {
    const { data, error } = await this.client.from("simulation_claims")
      .select("*").eq("run_id", runId);
    if (error) throw new Error("Simulation claim read failed.");
    return (data as SimulationClaimRecord[]) ?? [];
  }

  async listEvents(runId: string): Promise<SimulationEventRecord[]> {
    const { data, error } = await this.client.from("simulation_events")
      .select("*").eq("run_id", runId).order("created_at", { ascending: true });
    if (error) throw new Error("Simulation event read failed.");
    return (data as SimulationEventRecord[]) ?? [];
  }
}
