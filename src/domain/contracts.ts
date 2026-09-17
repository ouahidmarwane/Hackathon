/**
 * Canonical contract values shared by every layer.
 *
 * Definitions: docs/architecture/glossary.md and
 * docs/architecture/data-provenance.md. Code must use these exact strings.
 *
 * Operational diagnosis is a separate dimension and is intentionally not
 * defined here until its requirements are settled.
 */

/** Where a record came from. Set once at creation and never changed. */
export const DATA_PROVENANCE = Object.freeze([
  "SUPPLIED",
  "SYNTHETIC",
  "INTEGRATION",
  "GENERATED",
  "HUMAN_VALIDATED",
] as const);

export type DataProvenance = (typeof DATA_PROVENANCE)[number];

/** Whether the evidence backs a single claim. */
export const EVIDENCE_CLASSIFICATIONS = Object.freeze([
  "SUPPORTED",
  "CONFLICTING_EVIDENCE",
  "INSUFFICIENT_EVIDENCE",
] as const);

export type EvidenceClassification = (typeof EVIDENCE_CLASSIFICATIONS)[number];

export function isDataProvenance(value: unknown): value is DataProvenance {
  return (DATA_PROVENANCE as readonly unknown[]).includes(value);
}

export function isEvidenceClassification(
  value: unknown,
): value is EvidenceClassification {
  return (EVIDENCE_CLASSIFICATIONS as readonly unknown[]).includes(value);
}
