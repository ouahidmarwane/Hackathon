import { EVIDENCE_RULES, type EvidenceFinding } from "@/domain/evidence-engine";
import { missingLabels, propertyLabel, type CaseView } from "@/presentation/control-tower";
import { ProvenanceBadge } from "./badges";
import { Icon } from "./icons";

export function FindingWhy({ finding, item }: { finding: EvidenceFinding; item: CaseView }) {
  const events = (ids: string[]) => ids.length ? ids.map(id => `${item.events.find(event => event.id === id)?.external_id ?? "Event"} · ${id}`).join("\n") : "None";
  return <details className="why"><summary>Show me why<span>Inspect sources and rule<Icon name="arrow" /></span></summary><div className="why-content">
    <p className="rule-description">{EVIDENCE_RULES[finding.rule_code]}</p>
    <dl className="trace-grid">
      <div><dt>Evaluated claim</dt><dd>{propertyLabel(finding.subject.property)} = {finding.subject.value}<code>{finding.subject.claim_id}</code></dd></div>
      <div><dt>Source claims</dt><dd>{finding.source_claim_ids.map(id => <code key={id}>{id}</code>)}</dd></div>
      <div><dt>Related events · context may be unverified</dt><dd className="trace-ids">{events(finding.related_event_ids)}</dd></div>
      <div><dt>Supporting events</dt><dd className="trace-ids">{events(finding.supporting_event_ids)}</dd></div>
      <div><dt>Conflicting events</dt><dd className="trace-ids">{events(finding.conflicting_event_ids)}</dd></div>
      <div><dt>Missing requirements</dt><dd>{finding.missing_evidence.length ? finding.missing_evidence.map(code => <span key={code}>{missingLabels[code]}<code>{code}</code></span>) : "None for this assertion"}</dd></div>
      <div><dt>Deterministic rule</dt><dd><code>{finding.rule_code}</code><code>{finding.rule_version}</code></dd></div>
      <div><dt>Finding origin</dt><dd><ProvenanceBadge value={finding.provenance} /><code>{finding.producer}</code>{finding.depends_on_synthetic && <span>Depends on synthetic evidence</span>}</dd></div>
    </dl>
  </div></details>;
}
