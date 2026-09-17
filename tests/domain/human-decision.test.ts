import { describe, expect, it } from "vitest";

import {
  HUMAN_DECISION_TYPES,
  DecisionError,
  isHumanDecisionType,
  parseHumanDecisionRecord,
  validateHumanDecisionInput,
  type HumanDecision,
} from "@/domain/human-decision";

const validApprove = {
  jobId: "10000000-0000-4000-8000-000000000001",
  investigationPlanId: "10000000-0000-4000-8000-000000000002",
  decisionType: "APPROVED" as const,
  selectedNextStep: "Confirm the part-to-job / technician handoff.",
};

const validCorrect = {
  ...validApprove,
  decisionType: "CORRECTED" as const,
  correctionText: "The scanned item belongs to another work order.",
};

describe("HumanDecisionType contract", () => {
  it("has exactly the canonical values", () => {
    expect(HUMAN_DECISION_TYPES).toEqual(["APPROVED", "CORRECTED"]);
  });

  it("accepts only canonical strings", () => {
    expect(HUMAN_DECISION_TYPES.every(isHumanDecisionType)).toBe(true);
    expect(isHumanDecisionType("APPROVE")).toBe(false);
    expect(isHumanDecisionType("corrected")).toBe(false);
    expect(isHumanDecisionType(null)).toBe(false);
  });
});

describe("human decision input validation", () => {
  it("accepts a valid approval", () => {
    expect(validateHumanDecisionInput(validApprove)).toEqual(validApprove);
  });

  it("accepts a valid correction with reason and reference", () => {
    expect(validateHumanDecisionInput({
      ...validCorrect, correctionReason: "Misassigned scan", humanEvidenceReference: "goods-in log",
    })).toEqual({
      ...validCorrect, correctionReason: "Misassigned scan", humanEvidenceReference: "goods-in log",
    });
  });

  it("requires correction text for CORRECTED", () => {
    expect(() => validateHumanDecisionInput({ ...validCorrect, correctionText: undefined }))
      .toThrow(DecisionError);
    expect(() => validateHumanDecisionInput({ ...validCorrect, correctionText: "" }))
      .toThrow(DecisionError);
    expect(() => validateHumanDecisionInput({ ...validCorrect, correctionText: "   " }))
      .toThrow(DecisionError);
  });

  it("rejects correction fields on APPROVED", () => {
    expect(() => validateHumanDecisionInput({ ...validApprove, correctionText: "x" }))
      .toThrow(/no correction fields/);
  });

  it("rejects unknown fields, missing fields and invalid decision types", () => {
    expect(() => validateHumanDecisionInput({ ...validApprove, provenance: "HUMAN_VALIDATED" }))
      .toThrow(/Unexpected/);
    expect(() => validateHumanDecisionInput({ ...validApprove, reviewer: "me" }))
      .toThrow(/Unexpected/);
    expect(() => validateHumanDecisionInput({ ...validApprove, decisionType: "APPROVE" }))
      .toThrow(/Invalid decision type/);
    expect(() => validateHumanDecisionInput(null)).toThrow(DecisionError);
  });

  it("bounds correction length and rejects control or invisible characters", () => {
    expect(() => validateHumanDecisionInput({ ...validCorrect, correctionText: "x".repeat(1001) }))
      .toThrow(/at most 1000/);
    expect(() => validateHumanDecisionInput({ ...validCorrect, correctionText: "ok\nhidden" }))
      .toThrow(/control/);
    expect(() => validateHumanDecisionInput({ ...validCorrect, correctionText: "ok\u200bhidden" }))
      .toThrow(/control/);
  });

  it("rejects malformed identifiers", () => {
    expect(() => validateHumanDecisionInput({ ...validApprove, jobId: "not-a-uuid" }))
      .toThrow(/canonical UUID/);
    expect(() => validateHumanDecisionInput({ ...validApprove, investigationPlanId: "x".repeat(37) }))
      .toThrow(/canonical UUID/);
  });
});

const persisted: HumanDecision = {
  id: "20000000-0000-4000-8000-000000000001",
  jobId: "10000000-0000-4000-8000-000000000001",
  investigationPlanId: "10000000-0000-4000-8000-000000000002",
  decisionType: "APPROVED",
  selectedNextStep: "Confirm the part-to-job / technician handoff.",
  correctionText: null,
  correctionReason: null,
  humanEvidenceReference: null,
  reviewer: "Prototype reviewer",
  createdAt: "2026-09-17T14:30:00.000Z",
  provenance: "HUMAN_VALIDATED",
  sourceGeneratedPlanVersion: "investigation/c02/v1",
  sourceFindingIds: ["finding:1"],
  sourceClaimIds: ["10000000-0000-4000-8000-000000000002"],
  sourceEventIds: ["10000000-0000-4000-8000-000000000003"],
};

describe("persisted decision record validation", () => {
  it("accepts a valid persisted decision", () => {
    expect(parseHumanDecisionRecord(persisted)).toEqual(persisted);
  });

  it("rejects non-HUMAN_VALIDATED provenance", () => {
    expect(() => parseHumanDecisionRecord({ ...persisted, provenance: "GENERATED" }))
      .toThrow(/HUMAN_VALIDATED/);
  });

  it("rejects invalid timestamps and malformed source references", () => {
    expect(() => parseHumanDecisionRecord({ ...persisted, createdAt: "not-a-date" }))
      .toThrow(/timestamp/);
    expect(() => parseHumanDecisionRecord({ ...persisted, sourceClaimIds: ["not-a-uuid"] }))
      .toThrow(/canonical UUIDs/);
    expect(() => parseHumanDecisionRecord({ ...persisted, sourceEventIds: ["not-a-uuid"] }))
      .toThrow(/canonical UUIDs/);
  });
});
