import { createHash } from "node:crypto";
import type { ClaimRecord, EventRecord, JobRecord } from "./operational-model";
import type { EvidenceFinding, MissingEvidenceCode } from "./evidence-engine";
import type { AttentionLevel, CasePriority } from "./prioritization";

export type NovaAlertTrigger =
  | "CONFLICTING_EVIDENCE"
  | "ACTIONABLE_EVIDENCE_GAP"
  | "NEW_EVENT_REEVALUATION"
  | "IMMEDIATE_ATTENTION_REQUIRED";

export type NovaAlert = {
  id: string; // Deterministic fingerprint
  jobId: string;
  externalJobId: string;
  trigger: NovaAlertTrigger;
  attentionLevel: AttentionLevel;
  headline: string;
  recordedState: {
    stage: string;
    nextOwner: string;
  };
  relevantEvidence: Array<{
    externalId: string;
    eventType: string;
    provenance: string;
    occurredAt: string | null;
  }>;
  evidenceState: "SUPPORTED" | "INSUFFICIENT_EVIDENCE" | "CONFLICTING_EVIDENCE";
  unresolvedGaps: MissingEvidenceCode[];
  suggestedAction: string;
  reasons: string[];
  producer: "NOVA Operational Intelligence Agent";
  version: "nova/m10/v1";
  generatedAt: string;
};

export type NovaAlertDeliveryResult =
  | { status: "DELIVERED"; messageId: string; chatTitle?: string }
  | { status: "NOT_CONFIGURED"; reason: string }
  | { status: "FAILED"; error: string }
  | { status: "ALREADY_SENT"; fingerprint: string };

/**
 * Deterministic fingerprint for alert deduplication.
 * Includes job ID, trigger, findings classifications, missing codes, and recorded stage.
 * Never includes volatile timestamps or random values.
 */
export function computeAlertFingerprint(input: {
  jobId: string;
  trigger: NovaAlertTrigger;
  stage: string;
  classifications: string[];
  missingCodes: string[];
  suggestedAction?: string;
}): string {
  const payload = [
    input.jobId,
    input.trigger,
    input.stage.trim().toLowerCase(),
    [...input.classifications].sort().join(","),
    [...input.missingCodes].sort().join(","),
    (input.suggestedAction ?? "").trim(),
  ].join("|");

  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export type AlertEvaluationInput = {
  job: JobRecord;
  claims: readonly Readonly<ClaimRecord>[];
  events: readonly Readonly<EventRecord>[];
  findings: readonly Readonly<EvidenceFinding>[];
  priority: CasePriority;
  suggestedActionText?: string;
  isNewEventReevaluation?: boolean;
};

/**
 * Deterministic NOVA alert policy:
 * Evaluates whether an operational situation warrants human attention.
 * Triggers:
 * 1. CONFLICTING_EVIDENCE (explicit incompatible evidence between claims and events)
 * 2. ACTIONABLE_EVIDENCE_GAP (unresolved gap + actionable next investigation step)
 * 3. NEW_EVENT_REEVALUATION (event ingested that updated evidence state)
 * 4. IMMEDIATE_ATTENTION_REQUIRED (M08 priority level is IMMEDIATE_ATTENTION)
 *
 * Does NOT alert if the case has no conflicts, no gaps, or is purely MONITOR with no action.
 */
export function evaluateNovaAlert(input: AlertEvaluationInput): NovaAlert | null {
  const { job, claims, events, findings, priority, suggestedActionText, isNewEventReevaluation } = input;

  const hasConflict = findings.some(f => f.classification === "CONFLICTING_EVIDENCE");
  const missingCodes = [...new Set(findings.flatMap(f => f.missing_evidence))];
  const hasGaps = missingCodes.length > 0;
  const stageClaim = claims.find(c => c.property === "stage");
  const stageValue = stageClaim?.value ?? "stage not supplied";
  const ownerClaim = claims.find(c => c.property === "next_owner");
  const ownerValue = ownerClaim?.value ?? "not supplied";

  let trigger: NovaAlertTrigger | null = null;

  if (hasConflict) {
    trigger = "CONFLICTING_EVIDENCE";
  } else if (isNewEventReevaluation && hasGaps) {
    trigger = "NEW_EVENT_REEVALUATION";
  } else if (priority.level === "IMMEDIATE_ATTENTION") {
    trigger = "IMMEDIATE_ATTENTION_REQUIRED";
  } else if (hasGaps && suggestedActionText) {
    trigger = "ACTIONABLE_EVIDENCE_GAP";
  }

  if (!trigger) {
    return null;
  }

  const overallEvidenceState: NovaAlert["evidenceState"] = hasConflict
    ? "CONFLICTING_EVIDENCE"
    : hasGaps
    ? "INSUFFICIENT_EVIDENCE"
    : "SUPPORTED";

  const classifications = findings.map(f => f.classification);

  const fingerprint = computeAlertFingerprint({
    jobId: job.id,
    trigger,
    stage: stageValue,
    classifications,
    missingCodes,
    suggestedAction: suggestedActionText,
  });

  const relevantEvents = events.map(e => ({
    externalId: e.external_id,
    eventType: e.event_type,
    provenance: e.provenance,
    occurredAt: e.occurred_at_raw,
  }));

  const headline = hasConflict
    ? `Incompatible evidence detected for Work Order ${job.external_id}`
    : `Operational review required for Work Order ${job.external_id}`;

  return {
    id: fingerprint,
    jobId: job.id,
    externalJobId: job.external_id,
    trigger,
    attentionLevel: priority.level,
    headline,
    recordedState: {
      stage: stageValue,
      nextOwner: ownerValue,
    },
    relevantEvidence: relevantEvents,
    evidenceState: overallEvidenceState,
    unresolvedGaps: missingCodes,
    suggestedAction: suggestedActionText ?? "Review case records in the Control Tower.",
    reasons: priority.reasons,
    producer: "NOVA Operational Intelligence Agent",
    version: "nova/m10/v1",
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Formats a concise, demo-friendly plain text message for Telegram.
 * Formatted from actual current findings, never arbitrary or overclaimed.
 */
export function formatTelegramMessage(alert: NovaAlert): string {
  const lines: string[] = [
    "🤖 NOVA — Workshop Flow Intelligence",
    "",
    `⚠️ Work Order ${alert.externalJobId} requires review`,
    "",
    "📍 Recorded state:",
    alert.recordedState.stage,
  ];

  if (alert.relevantEvidence.length > 0) {
    lines.push("");
    lines.push("🔍 Available evidence:");
    for (const ev of alert.relevantEvidence.slice(0, 2)) {
      const timeStr = ev.occurredAt ? ` (${ev.occurredAt})` : "";
      lines.push(`• ${ev.eventType} [${ev.provenance}]${timeStr}`);
    }
  }

  lines.push("");
  lines.push("🧠 NOVA assessment:");
  if (alert.evidenceState === "CONFLICTING_EVIDENCE") {
    lines.push("Explicit incompatible evidence detected between recorded claims and events.");
  } else if (alert.evidenceState === "INSUFFICIENT_EVIDENCE") {
    lines.push(`Operational assertion recorded, but ${alert.unresolvedGaps.length} evidence requirement(s) remain unverified.`);
  } else {
    lines.push("Recorded claims are supported by verified evidence.");
  }

  if (alert.suggestedAction) {
    lines.push("");
    lines.push("👉 Recommended next step:");
    lines.push(alert.suggestedAction);
  }

  lines.push("");
  lines.push(`📊 Evidence state: ${alert.evidenceState.replace(/_/g, " ")}`);
  lines.push(`⚡ Attention level: ${alert.attentionLevel.replace(/_/g, " ")}`);
  lines.push("");
  lines.push("👤 Human review required.");

  return lines.join("\n");
}

