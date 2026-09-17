import type { DataProvenance, EvidenceClassification } from "@/domain/contracts";
import { evidenceLabels, provenanceLabels, type AttentionLevel, ATTENTION_LABELS } from "@/presentation/control-tower";
import { Icon } from "./icons";
export function EvidenceBadge({ state }: { state: EvidenceClassification }) {
  return <span className={`evidence-badge ${state.toLowerCase()}`}><Icon name={state === "SUPPORTED" ? "check" : state === "CONFLICTING_EVIDENCE" ? "conflict" : "gap"} />{evidenceLabels[state]}</span>;
}
export function ProvenanceBadge({ value }: { value: DataProvenance }) {
  return <span className={`provenance provenance-${value.toLowerCase()}`}>{provenanceLabels[value]}</span>;
}
export function AttentionBadge({ level }: { level: AttentionLevel }) {
  return <span className={`attention-badge attention-${level.toLowerCase()}`}>{ATTENTION_LABELS[level] ?? level}</span>;
}

