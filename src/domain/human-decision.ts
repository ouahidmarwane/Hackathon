/**
 * M06 human decision layer contract.
 *
 * A human decision is a NEW linked record that APPROVES or CORRECTS a
 * generated investigation plan's suggested next step. It never mutates source
 * records, M03 findings, the generated investigation, workshop stage, or any
 * event. Provenance is always HUMAN_VALIDATED and is set by the server.
 *
 * Definitions: docs/architecture/data-provenance.md.
 */

import { isDataProvenance } from "./contracts";

export const HUMAN_DECISION_TYPES = Object.freeze([
  "APPROVED",
  "CORRECTED",
] as const);
export type HumanDecisionType = (typeof HUMAN_DECISION_TYPES)[number];

export const DECISION_MAX_NEXT_STEP = 400;
export const DECISION_MAX_CORRECTION = 1000;
export const DECISION_MAX_SHORT = 200;
export const DECISION_MAX_FINDING_REF = 2000;

export class DecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionError";
  }
}

export function isHumanDecisionType(
  value: unknown,
): value is HumanDecisionType {
  return (HUMAN_DECISION_TYPES as readonly unknown[]).includes(value);
}

/** Browser-submitted decision request. Provenance, reviewer, source references
 * and timestamps are deliberately absent: the server derives or sets them. */
export type HumanDecisionInput = {
  jobId: string;
  investigationPlanId: string;
  decisionType: HumanDecisionType;
  selectedNextStep: string;
  correctionText?: string;
  correctionReason?: string;
  humanEvidenceReference?: string;
};

/** Persisted decision record with HUMAN_VALIDATED provenance. */
export type HumanDecision = {
  id: string;
  jobId: string;
  investigationPlanId: string;
  decisionType: HumanDecisionType;
  selectedNextStep: string;
  correctionText: string | null;
  correctionReason: string | null;
  humanEvidenceReference: string | null;
  reviewer: string;
  createdAt: string;
  provenance: "HUMAN_VALIDATED";
  sourceGeneratedPlanVersion: string;
  sourceFindingIds: string[];
  sourceClaimIds: string[];
  sourceEventIds: string[];
};

/** Everything persisted except the server-generated creation timestamp. */
export type HumanDecisionDraftWithId = Omit<HumanDecision, "createdAt">;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// C0/C1 controls, DEL, zero-width separators and the byte-order mark.
const CONTROL_OR_INVISIBLE =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/;

function strictObject(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DecisionError("Expected an object.");
  }
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !keys.includes(key))) {
    throw new DecisionError("Unexpected input field.");
  }
  return object;
}

function boundedText(value: unknown, max: number, label: string): string {
  if (
    typeof value !== "string" || !value.trim() || value.length > max ||
    value !== value.trim() || CONTROL_OR_INVISIBLE.test(value)
  ) {
    throw new DecisionError(
      `${label} must be nonempty, trimmed, at most ${max} characters, without control characters.`,
    );
  }
  return value;
}

function uuidText(value: unknown, label: string): string {
  const text = boundedText(value, DECISION_MAX_SHORT, label);
  if (!UUID_RE.test(text)) {
    throw new DecisionError(`${label} must be a canonical UUID.`);
  }
  return text;
}

function optionalText(
  value: unknown,
  max: number,
  label: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) {
    throw new DecisionError(`${label} must be omitted, not null.`);
  }
  return boundedText(value, max, label);
}

/** Strict allowlist validation of a browser decision request. */
export function validateHumanDecisionInput(value: unknown): HumanDecisionInput {
  const input = strictObject(value, [
    "jobId",
    "investigationPlanId",
    "decisionType",
    "selectedNextStep",
    "correctionText",
    "correctionReason",
    "humanEvidenceReference",
  ]);
  const jobId = uuidText(input.jobId, "Job");
  const investigationPlanId = uuidText(input.investigationPlanId, "Plan");
  if (!isHumanDecisionType(input.decisionType)) {
    throw new DecisionError("Invalid decision type.");
  }
  const decisionType = input.decisionType;
  const selectedNextStep = boundedText(
    input.selectedNextStep, DECISION_MAX_NEXT_STEP, "Selected next step",
  );
  const correctionText = optionalText(
    input.correctionText, DECISION_MAX_CORRECTION, "Correction",
  );
  const correctionReason = optionalText(
    input.correctionReason, DECISION_MAX_SHORT, "Correction reason",
  );
  const humanEvidenceReference = optionalText(
    input.humanEvidenceReference, DECISION_MAX_SHORT, "Evidence reference",
  );
  if (decisionType === "CORRECTED" && !correctionText) {
    throw new DecisionError("A correction requires meaningful correction text.");
  }
  if (
    decisionType === "APPROVED" &&
    (correctionText !== undefined || correctionReason !== undefined ||
      humanEvidenceReference !== undefined)
  ) {
    throw new DecisionError("Approval accepts no correction fields.");
  }
  return {
    jobId, investigationPlanId, decisionType, selectedNextStep,
    correctionText, correctionReason, humanEvidenceReference,
  };
}

/** Validates a trusted persisted decision row (server-side read path only). */
export function parseHumanDecisionRecord(value: unknown): HumanDecision {
  const input = strictObject(value, [
    "id", "jobId", "investigationPlanId", "decisionType", "selectedNextStep",
    "correctionText", "correctionReason", "humanEvidenceReference", "reviewer",
    "createdAt", "provenance", "sourceGeneratedPlanVersion",
    "sourceFindingIds", "sourceClaimIds", "sourceEventIds",
  ]);
  const id = uuidText(input.id, "Decision");
  const jobId = uuidText(input.jobId, "Job");
  const investigationPlanId = uuidText(input.investigationPlanId, "Plan");
  if (!isHumanDecisionType(input.decisionType)) {
    throw new DecisionError("Invalid decision type.");
  }
  const decisionType = input.decisionType;
  const selectedNextStep = boundedText(
    input.selectedNextStep, DECISION_MAX_NEXT_STEP, "Selected next step",
  );
  const correctionText = input.correctionText === null
    ? null : boundedText(input.correctionText, DECISION_MAX_CORRECTION, "Correction");
  const correctionReason = input.correctionReason === null
    ? null : boundedText(input.correctionReason, DECISION_MAX_SHORT, "Correction reason");
  const humanEvidenceReference = input.humanEvidenceReference === null
    ? null : boundedText(input.humanEvidenceReference, DECISION_MAX_SHORT, "Evidence reference");
  const reviewer = boundedText(input.reviewer, DECISION_MAX_SHORT, "Reviewer");
  if (
    typeof input.createdAt !== "string" ||
    !Number.isFinite(Date.parse(input.createdAt))
  ) {
    throw new DecisionError("Invalid decision timestamp.");
  }
  const createdAt = input.createdAt;
  if (input.provenance !== "HUMAN_VALIDATED" || !isDataProvenance(input.provenance)) {
    throw new DecisionError("Decisions require HUMAN_VALIDATED provenance.");
  }
  const sourceGeneratedPlanVersion = boundedText(
    input.sourceGeneratedPlanVersion, DECISION_MAX_SHORT, "Plan version",
  );
  if (decisionType === "CORRECTED" && correctionText === null) {
    throw new DecisionError("A corrected decision requires correction text.");
  }
  if (
    decisionType === "APPROVED" &&
    (correctionText !== null || correctionReason !== null ||
      humanEvidenceReference !== null)
  ) {
    throw new DecisionError("Approval must not carry correction fields.");
  }
  const entries = (value: unknown, label: string, max = 400): string[] => {
    if (!Array.isArray(value)) throw new DecisionError(`${label} must be a list.`);
    return value.map((item) => {
      if (
        typeof item !== "string" || !item || item.length > max ||
        CONTROL_OR_INVISIBLE.test(item)
      ) {
        throw new DecisionError(`Invalid ${label} entry.`);
      }
      return item;
    });
  };
  const sourceFindingIds = entries(input.sourceFindingIds, "Finding reference", DECISION_MAX_FINDING_REF);
  const sourceClaimIds = entries(input.sourceClaimIds, "Claim reference")
    .map((item) => {
      if (!UUID_RE.test(item)) {
        throw new DecisionError("Claim references must be canonical UUIDs.");
      }
      return item;
    });
  const sourceEventIds = entries(input.sourceEventIds, "Event reference")
    .map((item) => {
      if (!UUID_RE.test(item)) {
        throw new DecisionError("Event references must be canonical UUIDs.");
      }
      return item;
    });
  return {
    id, jobId, investigationPlanId, decisionType, selectedNextStep,
    correctionText, correctionReason, humanEvidenceReference, reviewer,
    createdAt, provenance: "HUMAN_VALIDATED", sourceGeneratedPlanVersion,
    sourceFindingIds, sourceClaimIds, sourceEventIds,
  };
}
