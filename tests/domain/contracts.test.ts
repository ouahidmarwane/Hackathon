import { describe, expect, it } from "vitest";

import {
  DATA_PROVENANCE,
  EVIDENCE_CLASSIFICATIONS,
  isDataProvenance,
  isEvidenceClassification,
} from "@/domain/contracts";

describe("DataProvenance contract", () => {
  it("has exactly the canonical values, in order", () => {
    expect(DATA_PROVENANCE).toEqual([
      "SUPPLIED",
      "SYNTHETIC",
      "INTEGRATION",
      "GENERATED",
      "HUMAN_VALIDATED",
    ]);
  });

  it("cannot be modified at runtime", () => {
    expect(Object.isFrozen(DATA_PROVENANCE)).toBe(true);
  });

  it("accepts only canonical strings", () => {
    expect(DATA_PROVENANCE.every(isDataProvenance)).toBe(true);
    expect(isDataProvenance("supplied")).toBe(false);
    expect(isDataProvenance("VALIDATED")).toBe(false);
    expect(isDataProvenance(undefined)).toBe(false);
  });
});

describe("EvidenceClassification contract", () => {
  it("has exactly the canonical values, in order", () => {
    expect(EVIDENCE_CLASSIFICATIONS).toEqual([
      "SUPPORTED",
      "CONFLICTING_EVIDENCE",
      "INSUFFICIENT_EVIDENCE",
    ]);
  });

  it("cannot be modified at runtime", () => {
    expect(Object.isFrozen(EVIDENCE_CLASSIFICATIONS)).toBe(true);
  });

  it("accepts only canonical strings and no diagnosis values", () => {
    expect(EVIDENCE_CLASSIFICATIONS.every(isEvidenceClassification)).toBe(true);
    expect(isEvidenceClassification("supported")).toBe(false);
    expect(isEvidenceClassification("BLOCKER")).toBe(false);
    expect(isEvidenceClassification(null)).toBe(false);
  });
});
