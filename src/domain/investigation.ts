import type { ClaimRecord, EventRecord, JobRecord } from "./operational-model";
import type { EvidenceFinding } from "./evidence-engine";

export type InvestigationInput = Readonly<{
  job: Readonly<JobRecord>; claims: readonly Readonly<ClaimRecord>[];
  events: readonly Readonly<EventRecord>[]; findings: readonly Readonly<EvidenceFinding>[];
}>;
export type InvestigationTrace = {
  sourceClaimIds: string[]; sourceEventIds: string[]; sourceFindingIds: string[];
  missingEvidenceCodes: string[]; ruleId: string;
};
export type InvestigationStatement = { text: string; trace: InvestigationTrace };
export type InvestigationPlan = {
  id: string;
  jobId: string; externalJobId: string; title: string; summary: string;
  knownFacts: InvestigationStatement[]; uncertainties: InvestigationStatement[];
  missingEvidence: { code: string; trace: InvestigationTrace }[];
  investigationSteps: InvestigationStatement[]; suggestedNextAction: InvestigationStatement;
  operationalAction: null; abstention: string;
  recordedOwners: InvestigationStatement[];
  ownerVerificationState: "NOT_RECORDED" | "NOT_INDEPENDENTLY_VERIFIED" | "SUPPORTED" | "CONFLICTING_EVIDENCE";
  rationale: InvestigationStatement[];
  sourceClaimIds: string[]; sourceEventIds: string[]; sourceFindingIds: string[];
  provenance: "GENERATED"; producer: string; version: string; dependsOnSynthetic: boolean;
};
export interface InvestigationProvider {
  generate(input: InvestigationInput): Promise<InvestigationPlan>;
}
