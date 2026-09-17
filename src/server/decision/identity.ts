import "server-only";
import { createHash } from "node:crypto";
import type { HumanDecisionDraftWithId } from "@/domain/human-decision";

/** Deterministic UUIDv8 for a human decision, over the reviewed plan, decision
 * type and human-supplied content. Excludes the server timestamp so an
 * accidental identical resubmission maps to the same record (ignore-duplicate)
 * rather than creating a second row. A later different decision naturally
 * receives a different identity.
 */
export function humanDecisionIdentity(record: HumanDecisionDraftWithId): string {
  const tuple = [
    "human-decision-v1",
    record.jobId,
    record.investigationPlanId,
    record.decisionType,
    record.selectedNextStep,
    record.correctionText ?? "",
    record.correctionReason ?? "",
    record.humanEvidenceReference ?? "",
  ];
  const bytes = createHash("sha256")
    .update(JSON.stringify(tuple))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
