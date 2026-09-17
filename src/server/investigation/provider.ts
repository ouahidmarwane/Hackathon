import "server-only";
import type { InvestigationInput, InvestigationPlan, InvestigationProvider, InvestigationStatement, InvestigationTrace } from "@/domain/investigation";
import type { MissingEvidenceCode } from "@/domain/evidence-engine";
import { investigationPlanIdentity } from "./plan-identity";
import { INVESTIGATION_ORDER, INVESTIGATION_PRODUCER, INVESTIGATION_RULES, INVESTIGATION_VERSION } from "./rules";

const unique = (values: readonly string[]) => [...new Set(values)].sort();
const sentence = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const labels: Record<string, string> = { stage: "Stage", part_receipt: "Part receipt", receipt_ref: "Receipt reference", customer_approval: "Customer approval", device_state: "Device state", part: "Part requirement" };

/** Pure, read-only guidance. Source text is quoted data, never instructions. */
export function createDeterministicPlan(input: InvestigationInput): InvestigationPlan {
  const properties = ["stage", "part_receipt", "receipt_ref", "part", "customer_approval", "device_state", "next_owner"];
  const propertyRank = (property: string) => properties.includes(property) ? properties.indexOf(property) : properties.length;
  const claims = [...input.claims].sort((a, b) => propertyRank(a.property) - propertyRank(b.property) || a.id.localeCompare(b.id, "en"));
  const events = [...input.events].sort((a, b) => a.id.localeCompare(b.id, "en"));
  const findings = [...input.findings].sort((a, b) => a.id.localeCompare(b.id, "en"));
  const claimIds = new Set(claims.map(claim => claim.id)); const eventIds = new Set(events.map(event => event.id));
  if (claimIds.size !== claims.length || eventIds.size !== events.length || new Set(findings.map(finding => finding.id)).size !== findings.length ||
    [...claims, ...events, ...findings].some(row => row.job_id !== input.job.id) ||
    findings.some(finding => !claimIds.has(finding.subject.claim_id) ||
      !["SUPPORTED", "INSUFFICIENT_EVIDENCE", "CONFLICTING_EVIDENCE"].includes(finding.classification) ||
      claims.find(claim => claim.id === finding.subject.claim_id)?.property !== finding.subject.property ||
      claims.find(claim => claim.id === finding.subject.claim_id)?.value !== finding.subject.value ||
      finding.source_claim_ids.some(id => !claimIds.has(id)) ||
      [...finding.related_event_ids, ...finding.supporting_event_ids, ...finding.conflicting_event_ids].some(id => !eventIds.has(id)))) {
    throw new Error("Invalid investigation evidence scope.");
  }
  const trace = (selected = findings, ruleId = "M05_EVIDENCE_SCOPE", codes: string[] = []): InvestigationTrace => ({
    sourceClaimIds: unique(selected.flatMap(finding => finding.source_claim_ids)),
    sourceEventIds: unique(selected.flatMap(finding => [...finding.related_event_ids, ...finding.supporting_event_ids, ...finding.conflicting_event_ids])),
    sourceFindingIds: unique(selected.map(finding => finding.id)), missingEvidenceCodes: codes, ruleId,
  });
  const statement = (text: string, reference: InvestigationTrace): InvestigationStatement => ({ text, trace: reference });
  const recorded = (claim: typeof claims[number]) => statement(
    `Recorded ${labels[claim.property] ?? claim.property.replaceAll("_", " ")}: ${sentence(claim.value)}.`,
    { ...trace(findings.filter(finding => finding.subject.claim_id === claim.id), "M05_RECORDED_CLAIM"), sourceClaimIds: [claim.id] });
  const knownFacts = claims.filter(claim => claim.property !== "next_owner").map(recorded);
  for (const event of events) knownFacts.push(statement(
    `${event.external_id} is a ${event.provenance.toLowerCase()} ${sentence(event.event_type)} event${event.occurred_at_raw === null ? "; time not supplied" : ` at ${event.occurred_at_raw}`}${event.time_kind === "clock" ? "; clock-only, date/timezone not supplied" : ""}.`,
    { ...trace(findings.filter(finding => finding.related_event_ids.includes(event.id)), "M05_SOURCE_EVENT"), sourceEventIds: [event.id] }));
  for (const finding of findings.filter(finding => finding.classification === "SUPPORTED")) knownFacts.push(statement(
    `${labels[finding.subject.property] ?? finding.subject.property} ${finding.subject.value} is supported for the exact evaluated assertion.`, trace([finding], "M05_EXACT_SUPPORT")));
  const codes = unique(findings.filter(finding => finding.classification === "INSUFFICIENT_EVIDENCE").flatMap(finding => finding.missing_evidence));
  const rank = (code: string) => { const index = INVESTIGATION_ORDER.indexOf(code as MissingEvidenceCode); return index < 0 ? INVESTIGATION_ORDER.length : index; };
  codes.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "en"));
  const missingEvidence = codes.map(code => ({ code, trace: trace(findings.filter(finding => finding.classification === "INSUFFICIENT_EVIDENCE" && (finding.missing_evidence as string[]).includes(code)), `M05_${Object.hasOwn(INVESTIGATION_RULES, code) ? code : "UNKNOWN_GAP"}`, [code]) }));
  const uncertainties: InvestigationStatement[] = [];
  const investigationSteps: InvestigationStatement[] = [];
  for (const missing of missingEvidence) {
    const rule = Object.hasOwn(INVESTIGATION_RULES, missing.code) ? INVESTIGATION_RULES[missing.code as MissingEvidenceCode] : undefined;
    uncertainties.push(statement(rule?.uncertainty ?? "An unrecognized evidence requirement cannot be safely interpreted by this provider.", missing.trace));
    investigationSteps.push(statement(rule?.step ?? "Review the unrecognized evidence requirement with the authoritative source / rule maintainer; obtain exact supporting evidence before proposing an operational action.", missing.trace));
  }
  const conflicts = findings.filter(finding => finding.classification === "CONFLICTING_EVIDENCE");
  if (conflicts.length) {
    uncertainties.unshift(statement("Explicit incompatible evidence remains unresolved; this provider does not choose which observation is current.", trace(conflicts, "M05_CONFLICT_REVIEW")));
    investigationSteps.unshift(statement("Review the exact conflicting claim / event scope in the authoritative source before proposing any workflow change.", trace(conflicts, "M05_CONFLICT_REVIEW")));
  }
  if (!investigationSteps.length) investigationSteps.push(statement("Review the exact source / finding scope before considering any operational action; supported assertions alone do not certify workflow readiness.", trace(findings, "M05_NO_OPERATIONAL_AUTHORITY")));
  const owners = claims.filter(claim => claim.property === "next_owner");
  const ownerFindings = findings.filter(finding => owners.some(owner => owner.id === finding.subject.claim_id));
  const ownerVerificationState = !owners.length ? "NOT_RECORDED" : ownerFindings.some(finding => finding.classification === "CONFLICTING_EVIDENCE") ? "CONFLICTING_EVIDENCE" :
    owners.every(owner => ownerFindings.some(finding => finding.subject.claim_id === owner.id && finding.classification === "SUPPORTED")) ? "SUPPORTED" : "NOT_INDEPENDENTLY_VERIFIED";
  const recordedOwners = owners.map(owner => statement(`Recorded next owner: ${sentence(owner.value)}.`, { ...trace(ownerFindings, "M05_RECORDED_OWNER"), sourceClaimIds: [owner.id] }));
  const primaryCode = codes.includes("PART_TO_JOB_HANDOFF_CONFIRMATION") ? "PART_TO_JOB_HANDOFF_CONFIRMATION" : codes.includes("APPROVAL_REQUEST_DISPATCH_CONFIRMATION") ? "APPROVAL_REQUEST_DISPATCH_CONFIRMATION" :
    codes.includes("QUALITY_CHECK_PROGRESS_CONFIRMATION") ? "QUALITY_CHECK_PROGRESS_CONFIRMATION" : codes.includes("OPERATIONAL_READINESS_CONFIRMATION") ? "OPERATIONAL_READINESS_CONFIRMATION" :
    codes.includes("STAGE_CONFIRMATION") ? "STAGE_CONFIRMATION" : codes[0];
  const primary = missingEvidence.find(missing => missing.code === primaryCode);
  const suggestedNextAction = conflicts.length ? investigationSteps[0] : primaryCode === "PART_TO_JOB_HANDOFF_CONFIRMATION" ? statement("Confirm the part-to-job / technician handoff before proposing a workflow status change.", primary!.trace) :
    primary ? statement(Object.hasOwn(INVESTIGATION_RULES, primaryCode) ? INVESTIGATION_RULES[primaryCode as MissingEvidenceCode].step : investigationSteps.find(step => step.trace.missingEvidenceCodes.includes(primaryCode))!.text, primary.trace) : investigationSteps[0];
  const rationale = missingEvidence.map(missing => statement(`M03 leaves ${missing.code} unresolved. Investigation rule ${missing.trace.ruleId} requests evidence rather than changing that classification.`, missing.trace));
  if (codes.includes("PART_TO_JOB_HANDOFF_CONFIRMATION")) rationale.unshift(statement("An exact supported receipt reference does not establish required-part receipt or job / technician handoff.", trace(findings.filter(finding => ["receipt_ref", "part_receipt", "stage"].includes(finding.subject.property)), "M05_PARTS_SCOPE", codes.filter(code => ["PART_TO_JOB_HANDOFF_CONFIRMATION", "PART_RECEIPT_CONFIRMATION"].includes(code)))));
  if (!rationale.length) rationale.push(statement("M03 assessments apply to exact assertions; this provider has no authority to propose a verified workflow transition from those assessments alone.", trace(findings, "M05_NO_OPERATIONAL_AUTHORITY")));
  if (conflicts.length) rationale.push(statement("M03 reports explicit conflicting evidence; review is required without overriding its classification.", trace(conflicts, "M05_CONFLICT_REVIEW")));
  const family = primaryCode === "PART_TO_JOB_HANDOFF_CONFIRMATION" ? "Parts / handoff" : primaryCode === "APPROVAL_REQUEST_DISPATCH_CONFIRMATION" ? "Approval" : primaryCode === "QUALITY_CHECK_PROGRESS_CONFIRMATION" ? "Quality-check" : primaryCode === "OPERATIONAL_READINESS_CONFIRMATION" ? "Readiness" : primaryCode === "STAGE_CONFIRMATION" ? "Stage verification" : "Evidence";
  const sourceClaimIds = unique(claims.map(claim => claim.id));
  const sourceEventIds = unique(events.map(event => event.id));
  const sourceFindingIds = unique(findings.map(finding => finding.id));
  return { id: investigationPlanIdentity({ jobId: input.job.id, producer: INVESTIGATION_PRODUCER, version: INVESTIGATION_VERSION, sourceClaimIds, sourceEventIds, sourceFindingIds }),
    jobId: input.job.id, externalJobId: input.job.external_id, title: `${family} investigation`,
    summary: "Verification guidance from recorded claims, available events and deterministic evidence findings.", knownFacts, uncertainties, missingEvidence,
    investigationSteps, suggestedNextAction, operationalAction: null, abstention: "No evidence-backed operational action can be proposed yet.", recordedOwners, ownerVerificationState, rationale,
    sourceClaimIds, sourceEventIds, sourceFindingIds,
    provenance: "GENERATED", producer: INVESTIGATION_PRODUCER, version: INVESTIGATION_VERSION,
    dependsOnSynthetic: input.job.provenance === "SYNTHETIC" || [...claims, ...events].some(row => row.provenance === "SYNTHETIC") || findings.some(finding => finding.depends_on_synthetic) };
}

export class DeterministicInvestigationProvider implements InvestigationProvider {
  async generate(input: InvestigationInput): Promise<InvestigationPlan> { return createDeterministicPlan(input); }
}
