import "server-only";
import {
  validateHumanDecisionInput,
  type HumanDecision,
  type HumanDecisionDraftWithId,
} from "@/domain/human-decision";
import type { InvestigationPlan } from "@/domain/investigation";
import { evaluateEvidence } from "@/domain/evidence-engine";
import { createDeterministicPlan } from "@/server/investigation/provider";
import type { OperationalSnapshot } from "@/server/control-tower/loader";
import { humanDecisionIdentity } from "./identity";

/** Prototype limitation: no authenticated user session exists yet. The server
 * pins a single explicit reviewer; it is never taken from the browser. */
export const PROTOTYPE_REVIEWER = "Prototype reviewer" as const;

export interface DecisionRepository {
  /** Persist an immutable decision; return the stored record including the
   * server-generated creation timestamp. Identical retries are no-ops. */
  appendDecision(record: HumanDecisionDraftWithId): Promise<HumanDecision>;
}

/** Recompute the exact deterministic plan a decision must reference. */
export function buildPlanForJob(
  snapshot: OperationalSnapshot,
  jobId: string,
): InvestigationPlan {
  const job = snapshot.jobs.find((row) => row.id === jobId);
  if (!job) throw new Error("Unknown work order.");
  const claims = snapshot.claims.filter((row) => row.job_id === jobId);
  const events = snapshot.events.filter((row) => row.job_id === jobId);
  const findings = evaluateEvidence({ claims, events });
  return createDeterministicPlan({ job, claims, events, findings });
}

/** Server-controlled human decision capture. Recomputes the plan, verifies the
 * submitted plan identity and reviewed next step, then persists an append-only
 * HUMAN_VALIDATED record. No operational action, event or source change occurs.
 */
export async function recordHumanDecision(
  value: unknown,
  snapshot: OperationalSnapshot,
  repository: DecisionRepository,
): Promise<HumanDecision> {
  const input = validateHumanDecisionInput(value);
  const plan = buildPlanForJob(snapshot, input.jobId);
  if (plan.id !== input.investigationPlanId) {
    throw new Error("The referenced investigation plan no longer matches.");
  }
  if (plan.suggestedNextAction.text !== input.selectedNextStep) {
    throw new Error("The reviewed next step no longer matches the plan.");
  }
  const draft: HumanDecisionDraftWithId = {
    id: "",
    jobId: plan.jobId,
    investigationPlanId: plan.id,
    decisionType: input.decisionType,
    selectedNextStep: plan.suggestedNextAction.text,
    correctionText: input.correctionText ?? null,
    correctionReason: input.correctionReason ?? null,
    humanEvidenceReference: input.humanEvidenceReference ?? null,
    reviewer: PROTOTYPE_REVIEWER,
    provenance: "HUMAN_VALIDATED",
    sourceGeneratedPlanVersion: plan.version,
    sourceFindingIds: plan.sourceFindingIds,
    sourceClaimIds: plan.sourceClaimIds,
    sourceEventIds: plan.sourceEventIds,
  };
  return repository.appendDecision({ ...draft, id: humanDecisionIdentity(draft) });
}
