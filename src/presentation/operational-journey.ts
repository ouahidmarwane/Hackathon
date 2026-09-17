import type { DataProvenance } from "@/domain/contracts";
import type { EvidenceFinding, MissingEvidenceCode } from "@/domain/evidence-engine";
import { missingLabels, propertyLabel, sentenceCase, type CaseView } from "./control-tower";

export type JourneyNodeKind = "RECORDED_STATE" | "OBSERVED_EVENT" | "EVIDENCE_GAP" | "CONFLICT";
export type JourneyNode = {
  id: string; kind: JourneyNodeKind; title: string; provenance: DataProvenance;
  claim_ids: string[]; event_ids: string[]; finding_claim_ids: string[];
  event_ref?: string; time_raw?: string | null; temporal_note?: string; support_labels?: string[];
};
export type JourneyIssue = JourneyNode & {
  kind: "EVIDENCE_GAP" | "CONFLICT"; missing_codes: MissingEvidenceCode[];
};
export type OperationalJourney = { nodes: JourneyNode[]; issues: JourneyIssue[]; context: { label: string; value: string; provenance: DataProvenance }[] };

// Presentation grouping/priority only. It never resolves or creates a finding.
const gapGroups: { codes: MissingEvidenceCode[]; title: string; priority: number }[] = [
  { codes: ["PART_TO_JOB_HANDOFF_CONFIRMATION"], title: "Part-to-job / technician handoff", priority: 1 },
  { codes: ["QUALITY_CHECK_PROGRESS_CONFIRMATION"], title: "Quality-check progress", priority: 2 },
  { codes: ["OPERATIONAL_READINESS_CONFIRMATION"], title: "Operational readiness", priority: 3 },
  { codes: ["APPROVAL_REQUEST_DISPATCH_CONFIRMATION", "CUSTOMER_APPROVAL_RESPONSE"], title: "Request dispatch / customer response", priority: 4 },
  { codes: ["PART_RECEIPT_CONFIRMATION"], title: "Receipt of the required part", priority: 5 },
  { codes: ["RECEIPT_REFERENCE_RESOLUTION"], title: "Receipt reference verification", priority: 6 },
  { codes: ["STAGE_CONFIRMATION"], title: "Recorded stage confirmation", priority: 7 },
  { codes: ["DEVICE_STATE_CONFIRMATION"], title: "Device state verification", priority: 8 },
  { codes: ["PART_REQUIREMENT_CONFIRMATION"], title: "Part requirement verification", priority: 9 },
  { codes: ["OWNER_ASSIGNMENT_CONFIRMATION"], title: "Recorded owner assignment", priority: 10 },
  { codes: ["CLAIM_VERIFICATION"], title: "Independent claim verification", priority: 11 },
];
const unique = (values: string[]) => [...new Set(values)].sort();

export function investigationFindings(item: CaseView, issue: JourneyIssue): EvidenceFinding[] {
  const initial = item.findings.filter(finding => issue.finding_claim_ids.includes(finding.subject.claim_id));
  const eventIds = new Set(initial.flatMap(finding => finding.related_event_ids));
  const sourceIds = new Set(initial.flatMap(finding => finding.source_claim_ids));
  // Include explicit reference support and other assessments citing the SAME
  // evidence; this is trace navigation, never a new causal/evidence conclusion.
  return item.findings.filter(finding => initial.includes(finding) || sourceIds.has(finding.subject.claim_id) ||
    finding.related_event_ids.some(id => eventIds.has(id)));
}

export function buildOperationalJourney(item: CaseView): OperationalJourney {
  const recorded = item.claims.filter(claim => claim.property === "stage").map(claim => ({
    id: `recorded-${claim.id}`, kind: "RECORDED_STATE" as const, title: sentenceCase(claim.value), provenance: claim.provenance,
    claim_ids: [claim.id], event_ids: [], finding_claim_ids: [claim.id],
  }));
  const observed = [...item.events].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(event => ({
    id: `observed-${event.id}`, kind: "OBSERVED_EVENT" as const, title: sentenceCase(event.event_type), provenance: event.provenance,
    claim_ids: [], event_ids: [event.id], event_ref: event.external_id, time_raw: event.occurred_at_raw,
    temporal_note: event.time_kind === "clock" ? "Clock-only · date/timezone not supplied" :
      event.time_kind === "unknown" ? "Time not supplied" : "Source timestamp with date and offset",
    finding_claim_ids: unique(item.findings.filter(finding => finding.related_event_ids.includes(event.id)).map(finding => finding.subject.claim_id)),
    support_labels: unique(item.findings.filter(finding => finding.classification === "SUPPORTED" && finding.supporting_event_ids.includes(event.id))
      .map(finding => `${propertyLabel(finding.subject.property)} supported`)),
  }));
  const gaps: JourneyIssue[] = [...gapGroups].sort((a, b) => a.priority - b.priority).flatMap(group => {
    const relevant = item.findings.filter(finding => finding.classification === "INSUFFICIENT_EVIDENCE" &&
      finding.missing_evidence.some(code => group.codes.includes(code)));
    const missing = group.codes.filter(code => relevant.some(finding => finding.missing_evidence.includes(code)));
    if (!missing.length) return [];
    return [{ id: `gap-${item.job.id}-${missing.join("-")}`, kind: "EVIDENCE_GAP" as const,
      title: missing.length === 1 && group.codes.length > 1 ? missingLabels[missing[0]] : group.title,
      provenance: "GENERATED" as const, claim_ids: unique(relevant.flatMap(finding => finding.source_claim_ids)),
      event_ids: unique(relevant.flatMap(finding => finding.related_event_ids)),
      finding_claim_ids: unique(relevant.map(finding => finding.subject.claim_id)), missing_codes: missing }];
  });
  const conflicts: JourneyIssue[] = item.findings.filter(finding => finding.classification === "CONFLICTING_EVIDENCE")
    .sort((a, b) => a.subject.claim_id < b.subject.claim_id ? -1 : 1).map(finding => ({
      id: `conflict-${finding.subject.claim_id}`, kind: "CONFLICT" as const,
      title: `${propertyLabel(finding.subject.property)} · incompatible evidence`, provenance: finding.provenance,
      claim_ids: [...finding.source_claim_ids], event_ids: [...finding.related_event_ids],
      finding_claim_ids: [finding.subject.claim_id], missing_codes: [...finding.missing_evidence],
    }));
  const issues = [...conflicts, ...gaps];
  return { nodes: [...recorded, ...observed, ...issues], issues,
    context: item.claims.filter(claim => claim.property !== "stage" && claim.property !== "next_owner")
      .map(claim => ({ label: propertyLabel(claim.property), value: sentenceCase(claim.value), provenance: claim.provenance })) };
}

/** Minimal interactive props: source/rule references stay in server panels. */
export type JourneyDisplayNode = Pick<JourneyNode, "id" | "kind" | "title" | "provenance" | "event_ref" | "time_raw" | "temporal_note" | "support_labels">;
export function journeyDisplayNodes(journey: OperationalJourney): JourneyDisplayNode[] {
  return journey.nodes.map(node => ({ id: node.id, kind: node.kind, title: node.title, provenance: node.provenance,
    event_ref: node.event_ref, time_raw: node.time_raw, temporal_note: node.temporal_note, support_labels: node.support_labels }));
}
