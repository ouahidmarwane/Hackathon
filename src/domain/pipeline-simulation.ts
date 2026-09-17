import { isDataProvenance } from "./contracts";

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

export const ALLOWED_TRANSITIONS: Record<PipelineStage, PipelineStage | null> = {
  RECEPTION: "DIAGNOSIS",
  DIAGNOSIS: "PARTS_APPROVAL",
  PARTS_APPROVAL: "REPAIR",
  REPAIR: "QUALITY_CHECK",
  QUALITY_CHECK: "READY",
  READY: "COLLECTION",
  COLLECTION: null,
};

export type SimulationRunStatus = "WAITING_APPROVAL" | "WAITING_INCIDENT_RESOLUTION" | "COMPLETED";

export type SimulationApprovalSource = "WEB" | "TELEGRAM";

export type PipelineState = {
  runId: string;
  externalJobId: string;
  currentStage: PipelineStage;
  nextStage: PipelineStage | null;
  status: SimulationRunStatus;
  incidentActive: boolean;
  incidentType?: "HANDOFF_MISSING";
  createdAt: string;
  updatedAt: string;
};

export function getNextStage(current: PipelineStage): PipelineStage | null {
  return ALLOWED_TRANSITIONS[current];
}

export function isValidTransition(from: PipelineStage, to: PipelineStage): boolean {
  return ALLOWED_TRANSITIONS[from] === to;
}

