/**
 * M11 — NOVA live human-in-the-loop workshop pipeline.
 *
 * Canonical stage machine, gate states and persistence shapes. Framework
 * independent: no Next.js, React, Supabase or app imports. The server owns all
 * transitions; this module only defines what a valid transition is.
 */

export const PIPELINE_STAGES = [
  "RECEPTION",
  "DIAGNOSIS",
  "PARTS_APPROVAL",
  "REPAIR",
  "QUALITY_CHECK",
  "READY",
  "COLLECTION",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  RECEPTION: "Reception",
  DIAGNOSIS: "Diagnosis",
  PARTS_APPROVAL: "Parts / Approval",
  REPAIR: "Repair",
  QUALITY_CHECK: "Quality Check",
  READY: "Ready",
  COLLECTION: "Collection",
};

/** Linear, no-skip demo transitions. COLLECTION → null means "complete". */
export const ALLOWED_TRANSITIONS: Record<PipelineStage, PipelineStage | null> = {
  RECEPTION: "DIAGNOSIS",
  DIAGNOSIS: "PARTS_APPROVAL",
  PARTS_APPROVAL: "REPAIR",
  REPAIR: "QUALITY_CHECK",
  QUALITY_CHECK: "READY",
  READY: "COLLECTION",
  COLLECTION: null,
};

export const SIMULATION_STAGE_STATUS = [
  "ACTIVE",
  "WAITING_FOR_EVIDENCE",
  "WAITING_FOR_APPROVAL",
  "COMPLETED",
] as const;
export type SimulationStageStatus = (typeof SIMULATION_STAGE_STATUS)[number];

export const SIMULATION_RUN_STATUS = ["RUNNING", "BLOCKED", "COMPLETED"] as const;
export type SimulationRunStatus = (typeof SIMULATION_RUN_STATUS)[number];

export const APPROVAL_CHANNELS = ["WEB", "TELEGRAM"] as const;
export type ApprovalChannel = (typeof APPROVAL_CHANNELS)[number];

/** The single stage where the demo evidence incident lives. */
export const INCIDENT_STAGE: PipelineStage = "PARTS_APPROVAL";

/** The synthetic part-scan observation external_id resolves against this
 * receipt_ref claim, mirroring the C02 R-1 reference relationship. */
export const SIMULATION_SOURCE = "synthetic:simulation";
export const SIMULATION_PRODUCER = "NOVA Simulation Engine";

export function getNextStage(current: PipelineStage): PipelineStage | null {
  return ALLOWED_TRANSITIONS[current];
}

export function isValidTransition(
  from: PipelineStage,
  to: PipelineStage,
): boolean {
  return ALLOWED_TRANSITIONS[from] === to;
}

export function stageLabel(stage: PipelineStage): string {
  return PIPELINE_STAGE_LABELS[stage];
}

/** Minimal persistence shapes (snake_case matches the M11 simulation tables). */
export type SimulationRunRecord = {
  id: string;
  external_id: string;
  run_number: number;
  current_stage: PipelineStage;
  stage_status: SimulationStageStatus;
  run_status: SimulationRunStatus;
  incident_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SimulationApprovalRecord = {
  id: string;
  run_id: string;
  from_stage: PipelineStage;
  to_stage: PipelineStage | "COMPLETED";
  reviewer: string;
  channel: ApprovalChannel;
  provenance: "HUMAN_VALIDATED";
  created_at: string;
};

export type SimulationClaimRecord = {
  id: string;
  run_id: string;
  property: string;
  value: string;
  provenance: "SYNTHETIC";
  created_at: string;
};

export type SimulationEventRecord = {
  id: string;
  run_id: string;
  external_id: string;
  event_type: string;
  provenance: "SYNTHETIC";
  created_at: string;
};

/** UI-facing state DTO, safe to serialize to the browser. */
export type PipelineState = {
  runId: string;
  externalId: string;
  currentStage: PipelineStage;
  nextStage: PipelineStage | null;
  stageStatus: SimulationStageStatus;
  runStatus: SimulationRunStatus;
  incidentActive: boolean;
  novaMessage: string;
  suggestedNextStep: string;
  createdAt: string;
  updatedAt: string;
  approvals: Array<{
    fromStage: PipelineStage;
    toStage: PipelineStage | "COMPLETED";
    channel: ApprovalChannel;
    createdAt: string;
  }>;
  events: Array<{ eventType: string; provenance: "SYNTHETIC"; createdAt: string }>;
};

