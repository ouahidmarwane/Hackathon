import type { EvidenceClassification, DataProvenance } from "@/domain/contracts";
import type { EvidenceFinding, MissingEvidenceCode } from "@/domain/evidence-engine";
import type { JobRecord, ClaimRecord, EventRecord } from "@/domain/operational-model";
import type { InvestigationPlan } from "@/domain/investigation";
import type { HumanDecision } from "@/domain/human-decision";
import { evaluateCasePriority, type CasePriority, type AttentionLevel, ATTENTION_LABELS } from "@/domain/prioritization";
import type { ResolutionMemory, MemoryRecallMatch } from "@/domain/resolution-memory";

export { type CasePriority, type AttentionLevel, ATTENTION_LABELS, type ResolutionMemory, type MemoryRecallMatch };

export const evidenceLabels: Record<EvidenceClassification, string> = {
  SUPPORTED: "Supported", CONFLICTING_EVIDENCE: "Conflicting evidence", INSUFFICIENT_EVIDENCE: "Insufficient evidence",
};
export const provenanceLabels: Record<DataProvenance, string> = {
  SUPPLIED: "Supplied", SYNTHETIC: "Synthetic", INTEGRATION: "Integration", GENERATED: "Generated", HUMAN_VALIDATED: "Human validated",
};
export const propertyLabels: Record<string, string> = {
  stage: "Stage", part_receipt: "Part receipt", receipt_ref: "Receipt reference", next_owner: "Next owner",
  customer_approval: "Customer approval", part: "Part requirement", device_state: "Device state",
};
export const missingLabels: Record<MissingEvidenceCode, string> = {
  PART_TO_JOB_HANDOFF_CONFIRMATION: "Part-to-job or technician handoff confirmation",
  PART_RECEIPT_CONFIRMATION: "Receipt confirmation for the required part",
  RECEIPT_REFERENCE_RESOLUTION: "Receipt reference verification",
  APPROVAL_REQUEST_DISPATCH_CONFIRMATION: "Approval request dispatch confirmation",
  CUSTOMER_APPROVAL_RESPONSE: "Customer approval response",
  QUALITY_CHECK_PROGRESS_CONFIRMATION: "Quality-check progress confirmation",
  OPERATIONAL_READINESS_CONFIRMATION: "Operational readiness confirmation",
  STAGE_CONFIRMATION: "Recorded stage confirmation",
  DEVICE_STATE_CONFIRMATION: "Device state confirmation",
  PART_REQUIREMENT_CONFIRMATION: "Part requirement confirmation",
  OWNER_ASSIGNMENT_CONFIRMATION: "Owner assignment confirmation",
  CLAIM_VERIFICATION: "Independent claim verification",
};
export const propertyLabel = (property: string) => propertyLabels[property] ?? property.replaceAll("_", " ");
export const sentenceCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
export type Counts = { supported: number; gaps: number; conflicts: number; claims: number };
export function countFindings(findings: readonly EvidenceFinding[]): Counts {
  return { claims: findings.length, supported: findings.filter(row => row.classification === "SUPPORTED").length,
    gaps: findings.filter(row => row.classification === "INSUFFICIENT_EVIDENCE").length,
    conflicts: findings.filter(row => row.classification === "CONFLICTING_EVIDENCE").length };
}
export type CaseView = {
  job: JobRecord; claims: ClaimRecord[]; events: EventRecord[]; findings: EvidenceFinding[]; counts: Counts;
  stages: string[]; owners: string[]; missing: MissingEvidenceCode[];
  decisions: HumanDecision[];
  priority: CasePriority;
  relatedMemories: MemoryRecallMatch[];
  investigationPlan?: InvestigationPlan;
};
export type TowerView = { cases: CaseView[]; counts: Counts; jobs: number; eventCount: number; memories: ResolutionMemory[] };
export function buildTowerView(snapshot: { jobs: JobRecord[]; claims: ClaimRecord[]; events: EventRecord[] }, findings: EvidenceFinding[]): TowerView {
  const order = ["stage", "part_receipt", "receipt_ref", "part", "customer_approval", "device_state", "next_owner"];
  const cases = snapshot.jobs.map(job => {
    const claims = snapshot.claims.filter(claim => claim.job_id === job.id).sort((a, b) => {
      const rank = (property: string) => order.includes(property) ? order.indexOf(property) : order.length;
      return rank(a.property) - rank(b.property) || (a.id < b.id ? -1 : 1);
    });
    const jobEvents = snapshot.events.filter(event => event.job_id === job.id);
    const jobFindings = claims.flatMap(claim => findings.filter(finding => finding.job_id === job.id && finding.subject.claim_id === claim.id));
    const priority = evaluateCasePriority({ job, claims, events: jobEvents, findings: jobFindings, decisions: [] });
    return { job, claims, events: jobEvents, findings: jobFindings,
      counts: countFindings(jobFindings), stages: claims.filter(claim => claim.property === "stage").map(claim => claim.value),
      owners: claims.filter(claim => claim.property === "next_owner").map(claim => claim.value),
      missing: [...new Set(jobFindings.flatMap(finding => finding.missing_evidence))],
      decisions: [],
      relatedMemories: [],
      priority };
  });
  return { cases, counts: countFindings(findings), jobs: snapshot.jobs.length, eventCount: snapshot.events.length, memories: [] };
}
