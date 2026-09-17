import type { CaseView } from "./control-tower";
import { buildOperationalJourney, journeyDisplayNodes, type JourneyNode, type JourneyIssue, type JourneyDisplayNode } from "./operational-journey";

// Product workflow context, NOT supplied challenge evidence or observed history.
export const WORKSHOP_WORKFLOW = [
  { id: "reception", label: "Reception" },
  { id: "diagnosis", label: "Diagnosis" },
  { id: "parts-approval", label: "Parts / Approval" },
  { id: "repair", label: "Repair" },
  { id: "quality-check", label: "Quality check" },
  { id: "ready", label: "Ready" },
  { id: "collection", label: "Collection" },
] as const;
export type WorkflowStageId = typeof WORKSHOP_WORKFLOW[number]["id"];
const positions: Record<string, WorkflowStageId> = {
  reception: "reception", diagnosis: "diagnosis", "awaiting parts": "parts-approval",
  "awaiting approval": "parts-approval", repair: "repair", "repair paused": "repair",
  "quality check": "quality-check", ready: "ready", collection: "collection",
};
export type PipelineStage = {
  id: WorkflowStageId; label: string; context: "PRODUCT_WORKFLOW_TEMPLATE";
  recorded: JourneyNode[]; events: JourneyNode[]; issues: JourneyIssue[];
};
export type WorkshopPipeline = { stages: PipelineStage[]; unplaced: { recorded: JourneyNode[]; events: JourneyNode[]; issues: JourneyIssue[] } };

export function buildWorkshopPipeline(item: CaseView): WorkshopPipeline {
  const journey = buildOperationalJourney(item);
  const stages: PipelineStage[] = WORKSHOP_WORKFLOW.map(stage => ({ ...stage, context: "PRODUCT_WORKFLOW_TEMPLATE", recorded: [], events: [], issues: [] }));
  const unplaced: WorkshopPipeline["unplaced"] = { recorded: [], events: [], issues: [] };
  const locate = (id?: WorkflowStageId) => stages.find(stage => stage.id === id) ?? unplaced;
  const recordedStage = (claimId: string) => positions[item.claims.find(claim => claim.id === claimId)?.value.toLowerCase() ?? ""];
  for (const node of journey.nodes.filter(node => node.kind === "RECORDED_STATE")) locate(recordedStage(node.claim_ids[0])).recorded.push(node);
  for (const node of journey.nodes.filter(node => node.kind === "OBSERVED_EVENT")) {
    const type = item.events.find(event => event.id === node.event_ids[0])!.event_type.toLowerCase();
    // Placement is workflow context only; it establishes no event outcome.
    const id = /^(part scan|part receipt|part handoff|approval request|customer approval)/.test(type) ? "parts-approval" :
      /^quality check/.test(type) || /^device state confirmed:/.test(type) ? "quality-check" :
      /^operational readiness/.test(type) ? "ready" : undefined;
    locate(id).events.push(node);
  }
  for (const issue of journey.issues) {
    const finding = item.findings.find(finding => issue.finding_claim_ids.includes(finding.subject.claim_id));
    const codes = issue.missing_codes;
    const id = codes.some(code => /^(PART_|RECEIPT_|APPROVAL_|CUSTOMER_)/.test(code)) ? "parts-approval" :
      codes.includes("QUALITY_CHECK_PROGRESS_CONFIRMATION") || codes.includes("DEVICE_STATE_CONFIRMATION") ? "quality-check" :
      codes.includes("OPERATIONAL_READINESS_CONFIRMATION") ? "ready" :
      finding?.subject.property === "stage" ? recordedStage(finding.subject.claim_id) :
      finding?.subject.property === "device_state" ? "quality-check" :
      ["part", "part_receipt", "receipt_ref", "customer_approval"].includes(finding?.subject.property ?? "") ? "parts-approval" : undefined;
    locate(id).issues.push(issue);
  }
  return { stages, unplaced };
}

export type PipelineDisplayStage = { id: string; label: string; recorded: JourneyDisplayNode[]; events: JourneyDisplayNode[]; issues: (JourneyDisplayNode & { requirementCount: number })[] };
export type PipelineDisplay = { stages: PipelineDisplayStage[]; unplaced: Omit<PipelineDisplayStage, "id" | "label"> };
export function pipelineDisplay(pipeline: WorkshopPipeline): PipelineDisplay {
  const display = (nodes: JourneyNode[]) => journeyDisplayNodes({ nodes, issues: [], context: [] });
  const project = (stage: WorkshopPipeline["unplaced"]) => ({ recorded: display(stage.recorded), events: display(stage.events),
    issues: stage.issues.map(issue => ({ ...display([issue])[0], requirementCount: issue.missing_codes.length })) });
  return { stages: pipeline.stages.map(stage => ({ id: stage.id, label: stage.label, ...project(stage) })), unplaced: project(pipeline.unplaced) };
}
