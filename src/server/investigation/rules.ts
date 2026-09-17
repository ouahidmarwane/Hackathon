import type { MissingEvidenceCode } from "@/domain/evidence-engine";

export const INVESTIGATION_VERSION = "investigation/c02/v1";
export const INVESTIGATION_PRODUCER = "deterministic-investigation-provider";
// Dependency-oriented verification order, not severity or priority scoring.
export const INVESTIGATION_ORDER: MissingEvidenceCode[] = [
  "RECEIPT_REFERENCE_RESOLUTION", "APPROVAL_REQUEST_DISPATCH_CONFIRMATION", "CUSTOMER_APPROVAL_RESPONSE",
  "QUALITY_CHECK_PROGRESS_CONFIRMATION", "OPERATIONAL_READINESS_CONFIRMATION",
  "PART_RECEIPT_CONFIRMATION", "PART_TO_JOB_HANDOFF_CONFIRMATION", "STAGE_CONFIRMATION",
  "DEVICE_STATE_CONFIRMATION", "PART_REQUIREMENT_CONFIRMATION", "OWNER_ASSIGNMENT_CONFIRMATION", "CLAIM_VERIFICATION",
];
export const INVESTIGATION_RULES: Record<MissingEvidenceCode, { uncertainty: string; step: string }> = {
  PART_TO_JOB_HANDOFF_CONFIRMATION: {
    uncertainty: "Whether the part was assigned or handed to this work order / technician.",
    step: "Check authoritative parts-to-job / technician handoff evidence for the scanned or referenced part.",
  },
  PART_RECEIPT_CONFIRMATION: {
    uncertainty: "Whether receipt of the required part for this work order is independently confirmed.",
    step: "Verify required-part receipt against the referenced receipt / scan and this work order's part requirement.",
  },
  RECEIPT_REFERENCE_RESOLUTION: {
    uncertainty: "Whether the receipt reference resolves to the relevant source record.",
    step: "Resolve the referenced receipt source record before drawing further conclusions.",
  },
  APPROVAL_REQUEST_DISPATCH_CONFIRMATION: {
    uncertainty: "Whether the approval request was dispatched; preparation does not establish dispatch.",
    step: "Verify whether the prepared approval request was actually dispatched through the approved process.",
  },
  CUSTOMER_APPROVAL_RESPONSE: {
    uncertainty: "Whether an authoritative customer approval / response record exists; dispatch alone does not establish a response.",
    step: "Check for an authoritative customer approval / response record without assuming contact or a response.",
  },
  QUALITY_CHECK_PROGRESS_CONFIRMATION: {
    uncertainty: "Whether current quality-check progress is independently confirmed.",
    step: "Verify current quality-check progress from the authoritative workflow source or an independent event.",
  },
  OPERATIONAL_READINESS_CONFIRMATION: {
    uncertainty: "Whether operational readiness is independently established; recorded Ready alone is insufficient.",
    step: "Verify supporting evidence required to establish operational readiness.",
  },
  STAGE_CONFIRMATION: {
    uncertainty: "Whether the recorded stage remains the current authoritative operational stage.",
    step: "Confirm the work order's current operational stage in the authoritative workflow source.",
  },
  DEVICE_STATE_CONFIRMATION: {
    uncertainty: "Whether the recorded device state is independently confirmed; it establishes no cause of workflow problems.",
    step: "Verify device state independently using an authoritative device / system observation.",
  },
  PART_REQUIREMENT_CONFIRMATION: {
    uncertainty: "Whether the recorded part requirement is independently confirmed.",
    step: "Verify whether a part is actually required for this work order.",
  },
  OWNER_ASSIGNMENT_CONFIRMATION: {
    uncertainty: "Whether the recorded next-owner assignment is independently verified.",
    step: "Verify the currently assigned operational owner in the authoritative assignment source.",
  },
  CLAIM_VERIFICATION: {
    uncertainty: "Whether the recorded assertion has independent verification.",
    step: "Locate authoritative evidence for the exact recorded assertion and verify its scope.",
  },
};
