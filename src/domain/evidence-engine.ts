import type { EvidenceClassification } from "./contracts";
import { textValue, validateSourceRef, validateTime, type ClaimRecord, type EventRecord } from "./operational-model";

export const EVIDENCE_RULE_VERSION = "evidence-engine/c02/v1" as const;
export const EVIDENCE_PRODUCER = "deterministic-evidence-engine" as const;

export const MISSING_EVIDENCE = Object.freeze([
  "PART_TO_JOB_HANDOFF_CONFIRMATION", "PART_RECEIPT_CONFIRMATION",
  "RECEIPT_REFERENCE_RESOLUTION", "APPROVAL_REQUEST_DISPATCH_CONFIRMATION",
  "CUSTOMER_APPROVAL_RESPONSE", "QUALITY_CHECK_PROGRESS_CONFIRMATION",
  "OPERATIONAL_READINESS_CONFIRMATION", "STAGE_CONFIRMATION",
  "DEVICE_STATE_CONFIRMATION", "PART_REQUIREMENT_CONFIRMATION",
  "OWNER_ASSIGNMENT_CONFIRMATION", "CLAIM_VERIFICATION",
] as const);
export type MissingEvidenceCode = (typeof MISSING_EVIDENCE)[number];

export const EVIDENCE_RULES = Object.freeze({
  RECEIPT_REFERENCE: "Exact receipt_ref resolves a same-job, same-source part scan; verifies the reference only.",
  PART_RECEIPT: "A part scan does not establish receipt of the required part or job/technician handoff.",
  PART_HANDOFF_GAP: "Awaiting parts remains unverified without stage and parts-to-job/technician handoff confirmation.",
  APPROVAL_GAP: "A prepared request establishes neither dispatch nor a customer response or approval state.",
  QUALITY_CHECK_GAP: "Recorded quality check and device state do not establish progress.",
  READINESS_GAP: "Recorded ready does not establish operational readiness.",
  CLAIM_GAP: "A recorded assertion without a matching verification rule remains unverified.",
  DEVICE_OBSERVATION: "Explicit same-assertion device links compare online/offline; any incompatible observation takes precedence over support.",
} as const);
export type EvidenceRuleCode = keyof typeof EVIDENCE_RULES;

/** Trusted normalization input, not a request payload or inferred authority.
 * An adapter must establish that this observation verifies the exact assertion
 * (including device and temporal scope). M03 exposes no such external adapter.
 */
export type DeviceEvidenceLink = Readonly<{
  claim_id: string;
  event_id: string;
  scope: "same-device-same-assertion";
}>;

export type EvidenceFinding = {
  id: string;
  job_id: string;
  subject: { claim_id: string; property: string; value: string };
  classification: EvidenceClassification;
  source_claim_ids: string[];
  related_event_ids: string[];
  supporting_event_ids: string[];
  conflicting_event_ids: string[];
  missing_evidence: MissingEvidenceCode[];
  rule_code: EvidenceRuleCode;
  rule_version: typeof EVIDENCE_RULE_VERSION;
  provenance: "GENERATED";
  producer: typeof EVIDENCE_PRODUCER;
  depends_on_synthetic: boolean;
};

export type EvidenceInput = Readonly<{
  claims: readonly Readonly<ClaimRecord>[];
  events: readonly Readonly<EventRecord>[];
  device_links?: readonly DeviceEvidenceLink[];
}>;

const deviceValues: Readonly<Record<string, string>> = Object.freeze({
  "device state confirmed: online": "online",
  "device state confirmed: offline": "offline",
});
const sorted = (values: readonly string[]) => [...new Set(values)].sort();

function validateInput(input: EvidenceInput) {
  for (const records of [input.claims, input.events]) {
    const ids = new Set<string>();
    for (const record of records) {
      textValue(record.id); textValue(record.job_id); textValue(record.producer);
      validateSourceRef({ source: record.source, external_id: record.id });
      if (!["SUPPLIED", "SYNTHETIC", "INTEGRATION"].includes(record.provenance)) {
        throw new Error("Evidence requires source provenance; derived records are not evidence.");
      }
      if (ids.has(record.id)) throw new Error("Duplicate source identity.");
      ids.add(record.id);
    }
  }
  for (const claim of input.claims) {
    textValue(claim.property); textValue(claim.value); textValue(claim.source_record_ref);
  }
  const eventKeys = new Set<string>();
  for (const event of input.events) {
    textValue(event.event_type); textValue(event.external_id);
    const key = JSON.stringify([event.source, event.external_id]);
    if (eventKeys.has(key)) throw new Error("Ambiguous namespaced event identity.");
    eventKeys.add(key);
    const time = validateTime(event.time_kind === "unknown"
      ? { kind: "unknown" } : { kind: event.time_kind, raw: event.occurred_at_raw });
    if (time.kind === "timestamp"
      ? event.occurred_at === null || Date.parse(event.occurred_at) !== Date.parse(time.raw)
      : event.occurred_at !== null || (time.kind === "unknown" && event.occurred_at_raw !== null)) {
      throw new Error("Inconsistent event time representation.");
    }
  }
  for (const link of input.device_links ?? []) {
    const claim = input.claims.find(record => record.id === link.claim_id);
    const event = input.events.find(record => record.id === link.event_id);
    if (!claim || !event || link.scope !== "same-device-same-assertion" ||
      claim.job_id !== event.job_id || claim.source !== event.source ||
      claim.property !== "device_state" || !["online", "offline"].includes(claim.value) ||
      !Object.hasOwn(deviceValues, event.event_type)) {
      throw new Error("Invalid scoped device evidence link.");
    }
  }
}

/** Pure reconciliation over an immutable source snapshot. No clock, I/O or AI.
 * Each assertion is evaluated independently; no current-claim selection occurs.
 */
export function evaluateEvidence(input: EvidenceInput): EvidenceFinding[] {
  validateInput(input);
  return [...input.claims].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(claim => {
    const peers = input.claims.filter(record => record.job_id === claim.job_id && record.source === claim.source &&
      record.source_record_ref === claim.source_record_ref);
    const jobEvents = input.events.filter(event => event.job_id === claim.job_id && event.source === claim.source);
    const refs = peers.filter(record => record.property === "receipt_ref");
    const scans = refs.length === 1 ? jobEvents.filter(event => event.external_id === refs[0].value && event.event_type === "part scan") : [];
    const prepared = jobEvents.filter(event => event.event_type === "approval request prepared");
    let related: readonly Readonly<EventRecord>[] = [];
    let dependencies: readonly Readonly<ClaimRecord>[] = [claim];
    let supports: readonly Readonly<EventRecord>[] = [];
    let conflicts: readonly Readonly<EventRecord>[] = [];
    let missing: MissingEvidenceCode[] = [];
    let rule: EvidenceRuleCode = "CLAIM_GAP";
    let classification: EvidenceClassification = "INSUFFICIENT_EVIDENCE";

    if (claim.property === "receipt_ref") {
      rule = "RECEIPT_REFERENCE";
      related = jobEvents.filter(event => event.external_id === claim.value && event.event_type === "part scan");
      supports = related;
      classification = supports.length ? "SUPPORTED" : "INSUFFICIENT_EVIDENCE";
      if (!supports.length) missing = ["RECEIPT_REFERENCE_RESOLUTION"];
    } else if (claim.property === "part_receipt") {
      rule = "PART_RECEIPT"; related = scans; dependencies = [claim, ...refs];
      missing = ["PART_RECEIPT_CONFIRMATION"];
      if (!scans.length) missing.push("RECEIPT_REFERENCE_RESOLUTION");
    } else if (claim.property === "stage" && claim.value === "awaiting parts") {
      rule = "PART_HANDOFF_GAP"; related = scans; dependencies = [claim, ...refs];
      missing = ["STAGE_CONFIRMATION", "PART_TO_JOB_HANDOFF_CONFIRMATION"];
      if (!scans.length) missing.push("RECEIPT_REFERENCE_RESOLUTION");
    } else if (claim.property === "customer_approval") {
      rule = "APPROVAL_GAP"; related = prepared;
      missing = ["CUSTOMER_APPROVAL_RESPONSE"];
      if (prepared.length) missing.push("APPROVAL_REQUEST_DISPATCH_CONFIRMATION");
    } else if (claim.property === "stage" && claim.value === "quality check") {
      rule = "QUALITY_CHECK_GAP"; missing = ["QUALITY_CHECK_PROGRESS_CONFIRMATION"];
    } else if (claim.property === "stage" && claim.value === "ready") {
      rule = "READINESS_GAP"; missing = ["OPERATIONAL_READINESS_CONFIRMATION"];
    } else if (claim.property === "device_state") {
      const ids = new Set((input.device_links ?? []).filter(link => link.claim_id === claim.id).map(link => link.event_id));
      related = jobEvents.filter(event => ids.has(event.id));
      supports = related.filter(event => deviceValues[event.event_type] === claim.value);
      conflicts = related.filter(event => deviceValues[event.event_type] !== claim.value);
      rule = related.length ? "DEVICE_OBSERVATION" : "CLAIM_GAP";
      classification = conflicts.length ? "CONFLICTING_EVIDENCE" : supports.length ? "SUPPORTED" : "INSUFFICIENT_EVIDENCE";
      if (!related.length) missing = ["DEVICE_STATE_CONFIRMATION"];
    } else {
      missing = [claim.property === "stage" ? "STAGE_CONFIRMATION" :
        claim.property === "part" ? "PART_REQUIREMENT_CONFIRMATION" :
        claim.property === "next_owner" ? "OWNER_ASSIGNMENT_CONFIRMATION" : "CLAIM_VERIFICATION"];
      // Context only: a prepared request cannot establish why repair is paused.
      if (claim.property === "stage" && claim.value === "repair paused") related = prepared;
    }
    const finding = {
      job_id: claim.job_id,
      subject: { claim_id: claim.id, property: claim.property, value: claim.value },
      classification,
      source_claim_ids: sorted(dependencies.map(record => record.id)),
      related_event_ids: sorted(related.map(record => record.id)),
      supporting_event_ids: sorted(supports.map(record => record.id)),
      conflicting_event_ids: sorted(conflicts.map(record => record.id)),
      missing_evidence: sorted(missing) as MissingEvidenceCode[],
      rule_code: rule,
      rule_version: EVIDENCE_RULE_VERSION,
      provenance: "GENERATED" as const,
      producer: EVIDENCE_PRODUCER,
      depends_on_synthetic: [...dependencies, ...related].some(record => record.provenance === "SYNTHETIC"),
    };
    // Transparent, collision-free logical key; no hash library or UUID dependency.
    return { id: `finding:${JSON.stringify(finding)}`, ...finding };
  });
}
