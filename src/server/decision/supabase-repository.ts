import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseHumanDecisionRecord,
  type HumanDecision,
  type HumanDecisionDraftWithId,
} from "@/domain/human-decision";
import type { DecisionRepository } from "./service";

const equalLists = (left: readonly string[], right: readonly string[]) =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

/** Injected privileged (service-role) client only. Public clients are denied by
 * M06 SQL. Append-only: ignore-duplicate on deterministic identity, then the
 * stored row is read back and verified before success is reported. */
export class SupabaseDecisionRepository implements DecisionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async appendDecision(record: HumanDecisionDraftWithId): Promise<HumanDecision> {
    const payload = {
      id: record.id,
      job_id: record.jobId,
      investigation_plan_id: record.investigationPlanId,
      decision_type: record.decisionType,
      selected_next_step: record.selectedNextStep,
      correction_text: record.correctionText,
      correction_reason: record.correctionReason,
      human_evidence_reference: record.humanEvidenceReference,
      reviewer: record.reviewer,
      provenance: record.provenance,
      source_generated_plan_version: record.sourceGeneratedPlanVersion,
      source_finding_ids: record.sourceFindingIds,
      source_claim_ids: record.sourceClaimIds,
      source_event_ids: record.sourceEventIds,
    };
    // created_at is omitted: the database generates it. A duplicate identity
    // is ignored so an accidental identical resubmission cannot rewrite time.
    const { error } = await this.client.from("human_decisions")
      .upsert(payload, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error("Human decision append failed.");
    const { data, error: readError } = await this.client.from("human_decisions")
      .select("*").eq("id", record.id).single();
    if (readError || !data) throw new Error("Human decision verification failed.");
    const stored = parseHumanDecisionRecord(this.fromRow(data));
    const unchanged = stored.id === record.id &&
      stored.jobId === record.jobId &&
      stored.investigationPlanId === record.investigationPlanId &&
      stored.decisionType === record.decisionType &&
      stored.selectedNextStep === record.selectedNextStep &&
      stored.correctionText === record.correctionText &&
      stored.correctionReason === record.correctionReason &&
      stored.humanEvidenceReference === record.humanEvidenceReference &&
      stored.reviewer === record.reviewer &&
      stored.provenance === record.provenance &&
      stored.sourceGeneratedPlanVersion === record.sourceGeneratedPlanVersion &&
      equalLists(stored.sourceFindingIds, record.sourceFindingIds) &&
      equalLists(stored.sourceClaimIds, record.sourceClaimIds) &&
      equalLists(stored.sourceEventIds, record.sourceEventIds);
    if (!unchanged) {
      throw new Error("Conflicting human decision identity; original retained.");
    }
    return stored;
  }

  private fromRow(row: Record<string, unknown>): unknown {
    return {
      id: row.id,
      jobId: row.job_id,
      investigationPlanId: row.investigation_plan_id,
      decisionType: row.decision_type,
      selectedNextStep: row.selected_next_step,
      correctionText: row.correction_text,
      correctionReason: row.correction_reason,
      humanEvidenceReference: row.human_evidence_reference,
      reviewer: row.reviewer,
      createdAt: row.created_at,
      provenance: row.provenance,
      sourceGeneratedPlanVersion: row.source_generated_plan_version,
      sourceFindingIds: row.source_finding_ids,
      sourceClaimIds: row.source_claim_ids,
      sourceEventIds: row.source_event_ids,
    };
  }
}
