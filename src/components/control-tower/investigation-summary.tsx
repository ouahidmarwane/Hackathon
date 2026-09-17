import type { JourneyIssue } from "@/presentation/operational-journey";
import { investigationFindings } from "@/presentation/operational-journey";
import { missingLabels, propertyLabel, sentenceCase, type CaseView } from "@/presentation/control-tower";
import { ProvenanceBadge } from "./badges";
import { FindingWhy } from "./finding-why";
import { Icon } from "./icons";
import { InvestigationGuidance } from "./investigation-guidance";

export function InvestigationSummary({ item, issue }: { item: CaseView; issue: JourneyIssue }) {
  const findings = investigationFindings(item, issue);
  const claimIds = new Set(findings.flatMap(finding => finding.source_claim_ids));
  const eventIds = new Set(findings.flatMap(finding => finding.related_event_ids));
  const supported = findings.filter(finding => finding.classification === "SUPPORTED");
  const insufficient = findings.filter(finding => finding.classification === "INSUFFICIENT_EVIDENCE");
  const conflicting = findings.filter(finding => finding.classification === "CONFLICTING_EVIDENCE");
  const missing = [...new Set(findings.flatMap(finding => finding.missing_evidence))];
  const events = item.events.filter(event => eventIds.has(event.id));
  return <div className={`investigation-summary ${issue.kind === "CONFLICT" ? "investigation-conflict" : ""}`}>
    <div className="investigation-title"><Icon name={issue.kind === "CONFLICT" ? "conflict" : "gap"} /><div><h3>Evidence investigation · Work order {item.job.external_id}</h3><p>{issue.title} · {issue.kind === "CONFLICT" ? "Explicit incompatible evidence" : "Not confirmed by available evidence"}</p></div><ProvenanceBadge value="GENERATED" /></div>
    {item.investigationPlan && <InvestigationGuidance plan={item.investigationPlan} decisions={item.decisions} showHumanReview={false} />}
    <details className="why"><summary>Evidence verification details</summary>
    <div className="investigation-columns"><section><h4>Recorded state</h4><dl>{item.claims.filter(claim => claimIds.has(claim.id)).map(claim => <div key={claim.id}><dt>{propertyLabel(claim.property)}</dt><dd>{sentenceCase(claim.value)}</dd></div>)}</dl><p className="recorded-owner">Recorded next owner: <strong>{item.owners.map(sentenceCase).join(" / ") || "Not supplied"}</strong></p></section>
    <section><h4>Available evidence</h4>{events.length ? <ul>{events.map(event => <li className="investigation-event" key={event.id}><strong>{event.external_id} · {sentenceCase(event.event_type)}</strong><span>{event.occurred_at_raw ?? "Time not supplied"} <ProvenanceBadge value={event.provenance} /></span>{event.time_kind === "clock" && <small>Clock-only · date/timezone not supplied</small>}</li>)}</ul> : <p>No independent event recorded for this verification.</p>}</section></div>
    <div className="investigation-columns"><section><h4>What we can establish</h4>{supported.length ? <ul className="established-list">{supported.map(finding => <li key={finding.subject.claim_id}><Icon name="check" /><span>{propertyLabel(finding.subject.property)} = {finding.subject.value} · Supported</span></li>)}</ul> : <p>No directly supported assertion in this evidence chain.</p>}</section>
    <section><h4>What we cannot establish</h4><ul>{insufficient.map(finding => <li key={finding.subject.claim_id}>{propertyLabel(finding.subject.property)} = {finding.subject.value} · Insufficient evidence</li>)}</ul>{conflicting.length > 0 && <ul className="conflict-assertions">{conflicting.map(finding => <li key={finding.subject.claim_id}>{propertyLabel(finding.subject.property)} = {finding.subject.value} · Conflicting evidence</li>)}</ul>}{!insufficient.length && !conflicting.length && <p>No unresolved assertion in this selected evidence chain.</p>}</section></div>
    <section className="investigation-required"><h4>Evidence required</h4>{missing.length ? <ul>{missing.map(code => <li key={code}><Icon name="gap" />{missingLabels[code]}</li>)}</ul> : <p>Resolve the explicitly incompatible observations; the engine does not choose which is current.</p>}</section>
    <section className="investigation-traces"><h4>Show me why · Evidence traces</h4>{findings.map(finding => <div key={finding.subject.claim_id}><strong>{propertyLabel(finding.subject.property)}</strong><FindingWhy finding={finding} item={item} /></div>)}</section>
    <p className="investigation-limit">Evidence inspection only. A gap is not a confirmed failed transition or an operational blocker.</p>
    </details>
  </div>;
}
