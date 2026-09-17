import type { ClaimRecord, EventRecord, JobRecord } from "./operational-model";
import type { EvidenceFinding } from "./evidence-engine";
import type { HumanDecision } from "./human-decision";
import { evaluateJobTimeIntelligence, type JobTimeIntelligence } from "./time-intelligence";

export type AttentionLevel = "IMMEDIATE_ATTENTION" | "REVIEW" | "MONITOR";

export type PriorityFactorType =
  | "CONFLICT"
  | "EVIDENCE_GAP"
  | "ACTIONABLE_STEP"
  | "SYNTHETIC_EVIDENCE"
  | "HUMAN_DECISION"
  | "TIMING_EVIDENCE"
  | "STAGE_CONTEXT";

export type PriorityFactor = {
  type: PriorityFactorType;
  label: string;
  reason: string;
  sourceRefs: string[];
};

export type CasePriority = {
  level: AttentionLevel;
  levelLabel: string;
  headline: string;
  rank: number; // 1 = highest attention, 5 = lowest
  factors: PriorityFactor[];
  reasons: string[];
  timing: JobTimeIntelligence;
};

export type PrioritizationInput = {
  job: JobRecord;
  claims: readonly Readonly<ClaimRecord>[];
  events: readonly Readonly<EventRecord>[];
  findings: readonly Readonly<EvidenceFinding>[];
  decisions?: readonly Readonly<HumanDecision>[];
  suggestedActionText?: string;
};

export const ATTENTION_LABELS: Record<AttentionLevel, string> = {
  IMMEDIATE_ATTENTION: "Immediate Attention",
  REVIEW: "Review",
  MONITOR: "Monitor",
};

/**
 * Transparent, deterministic prioritization.
 * 
 * Strict invariants:
 * 1. NO black-box AI or numeric percentage score.
 * 2. NO invented delay, SLA breach, or waiting duration.
 * 3. Inspectable factors with source references and plain explanations.
 */
export function evaluateCasePriority(input: PrioritizationInput): CasePriority {
  const { job, claims, events, findings, decisions = [], suggestedActionText } = input;
  const timing = evaluateJobTimeIntelligence(job.id, events);

  const conflicts = findings.filter(f => f.classification === "CONFLICTING_EVIDENCE");
  const gaps = findings.filter(f => f.classification === "INSUFFICIENT_EVIDENCE");
  const missingCodes = [...new Set(findings.flatMap(f => f.missing_evidence))];
  const hasSynthetic = events.some(e => e.provenance === "SYNTHETIC") || findings.some(f => f.depends_on_synthetic);
  const stageClaim = claims.find(c => c.property === "stage");

  const factors: PriorityFactor[] = [];
  const reasons: string[] = [];

  // 1. Conflict Factor
  if (conflicts.length > 0) {
    const conflictRefs = conflicts.flatMap(c => [c.id, ...c.conflicting_event_ids]);
    factors.push({
      type: "CONFLICT",
      label: "Incompatible evidence present",
      reason: "Conflicting source observations exist for recorded claims; requires human adjudication.",
      sourceRefs: conflictRefs,
    });
    reasons.push("Explicit incompatible evidence remains unresolved between recorded claims and events.");
  }

  // 2. Evidence Gap Factor
  if (gaps.length > 0) {
    const gapRefs = gaps.map(g => g.id);
    const gapCount = missingCodes.length;
    factors.push({
      type: "EVIDENCE_GAP",
      label: `${gapCount} evidence requirement${gapCount === 1 ? "" : "s"} unresolved`,
      reason: "Recorded assertions have not been independently confirmed by available evidence.",
      sourceRefs: gapRefs,
    });
    reasons.push(
      missingCodes.length === 1
        ? `Unresolved evidence requirement: ${missingCodes[0].toLowerCase().replaceAll("_", " ")}.`
        : `${missingCodes.length} unresolved evidence requirements remain unverified.`,
    );
  }

  // 3. Actionable Next Investigation
  if (suggestedActionText) {
    factors.push({
      type: "ACTIONABLE_STEP",
      label: "Actionable investigation step",
      reason: suggestedActionText,
      sourceRefs: gaps.slice(0, 1).map(g => g.id),
    });
    reasons.push("An evidence-backed verification step is available before proposing workflow changes.");
  }

  // 4. Synthetic / Simulated Evidence
  if (hasSynthetic) {
    const syntheticEvents = events.filter(e => e.provenance === "SYNTHETIC");
    factors.push({
      type: "SYNTHETIC_EVIDENCE",
      label: "Simulated event present",
      reason: "Case includes synthetic evidence from workshop simulation.",
      sourceRefs: syntheticEvents.map(e => e.id),
    });
    reasons.push("Includes simulated workshop event evidence.");
  }

  // 5. Human Decisions
  if (decisions.length > 0) {
    const latest = decisions[decisions.length - 1];
    factors.push({
      type: "HUMAN_DECISION",
      label: `${decisions.length} human decision${decisions.length === 1 ? "" : "s"} recorded`,
      reason: `Latest: ${latest.decisionType} (${latest.provenance.toLowerCase().replaceAll("_", " ")}).`,
      sourceRefs: decisions.map(d => d.id),
    });
    reasons.push(`Human operational decision logged (${latest.decisionType.toLowerCase()}).`);
  }

  // 6. Timing Evidence
  factors.push({
    type: "TIMING_EVIDENCE",
    label: timing.state === "AVAILABLE" ? "Timestamp available" : timing.state === "PARTIAL" ? "Clock-only timing" : "No timing evidence",
    reason: timing.summary,
    sourceRefs: timing.latestEventId ? [timing.latestEventId] : [],
  });
  if (timing.state === "PARTIAL") {
    reasons.push("Timing is clock-only; duration in stage cannot be established from records.");
  } else if (timing.state === "UNAVAILABLE") {
    reasons.push("No timing records exist to evaluate waiting duration.");
  }

  // 7. Stage Context
  if (stageClaim) {
    factors.push({
      type: "STAGE_CONTEXT",
      label: `Recorded stage: ${stageClaim.value}`,
      reason: `Operational workflow recorded as ${stageClaim.value}.`,
      sourceRefs: [stageClaim.id],
    });
  }

  // Determine Categorical Attention Level & Rank (1 = highest priority, 5 = lowest)
  let level: AttentionLevel;
  let rank: number;
  let headline: string;

  if (conflicts.length > 0) {
    level = "IMMEDIATE_ATTENTION";
    rank = 1;
    headline = "Incompatible evidence requires human review";
  } else if (gaps.length > 0) {
    level = "REVIEW";
    if (hasSynthetic) {
      rank = 2; // newly changed / re-evaluated case with gaps
      headline = "Re-evaluated case with remaining evidence requirements";
    } else {
      rank = 3; // standard actionable gaps
      headline = "Current recorded assertions lack independent confirmation";
    }
  } else if (suggestedActionText) {
    level = "REVIEW";
    rank = 4;
    headline = "Actionable investigation step available";
  } else {
    level = "MONITOR";
    rank = 5;
    headline = "All recorded assertions supported by available evidence";
  }

  return {
    level,
    levelLabel: ATTENTION_LABELS[level],
    headline,
    rank,
    factors,
    reasons,
    timing,
  };
}

