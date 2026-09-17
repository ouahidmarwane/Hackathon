import { HumanReview } from "@/components/human-review/human-review";

import { InvestigationGuidance } from "./investigation-guidance";

import { NOVAAvatar } from "./nova-assistant";

import { missingLabels, propertyLabel, sentenceCase, type CaseView } from "@/presentation/control-tower";

import { EvidenceBadge, ProvenanceBadge, AttentionBadge } from "./badges";

import { Icon } from "./icons";

import { FindingWhy } from "./finding-why";

import { OperationalJourney } from "./operational-journey";

import { DemoEventButton } from "@/components/simulator/demo-event-button";

import { NovaAlertButton } from "@/components/alerts/nova-alert-button";

import { RelatedMemorySection } from "@/components/memory/related-memory-section";

import { CaptureMemory } from "@/components/memory/capture-memory";



// Friendly labels for the current M05 recommendation; exact wording stays in Show me why.
const guidanceCopy: Record<string, { explanation: string; action: string }> = {
  PART_TO_JOB_HANDOFF_CONFIRMATION: { explanation: "The part handoff to this work order still needs verification.", action: "Check the part handoff before updating the workflow." },
  PART_RECEIPT_CONFIRMATION: { explanation: "Receipt of the required part still needs verification.", action: "Check the receipt against this work order’s required part." },
  APPROVAL_REQUEST_DISPATCH_CONFIRMATION: { explanation: "The approval request may be prepared, but sending it still needs verification.", action: "Check whether the approval request was sent." },
  CUSTOMER_APPROVAL_RESPONSE: { explanation: "The customer’s approval still needs verification.", action: "Check for the customer’s recorded response." },
  QUALITY_CHECK_PROGRESS_CONFIRMATION: { explanation: "Quality-check progress still needs verification.", action: "Check the current quality-check progress in the workshop source." },
  OPERATIONAL_READINESS_CONFIRMATION: { explanation: "Recorded as Ready. Readiness still needs verification.", action: "Check the evidence that confirms this work order is ready." },
  STAGE_CONFIRMATION: { explanation: "The current workshop stage still needs verification.", action: "Confirm the current stage in the workshop source." },
  OWNER_ASSIGNMENT_CONFIRMATION: { explanation: "The recorded owner still needs verification.", action: "Check the current assignment in the workshop source." },
};

export function CaseDetail({ item, evidenceFirst = false }: { item: CaseView; evidenceFirst?: boolean }) {

  const plan = item.investigationPlan;
  const copy = plan?.suggestedNextAction.trace.ruleId === "M05_CONFLICT_REVIEW" ? { explanation: "Conflicting evidence needs your review.", action: "Check the conflicting records before updating the workflow." } : guidanceCopy[plan?.suggestedNextAction.trace.missingEvidenceCodes[0] ?? ""];
  const hasHandoff = item.events.some(event => /part.*handoff/i.test(event.event_type));

  const primaryStage = item.stages[0] ?? "";

  const latestDecision = item.decisions?.[0];



  const evidence = <section className="detail-section evidence-section" id="available-evidence"><div className="section-heading"><h3>Available evidence</h3><span>{item.events.length} {item.events.length === 1 ? "event" : "events"}</span></div>

    {item.events.length ? <ul className="event-list">{item.events.map(event => <li key={event.id}><span className="event-icon"><Icon name="evidence" /></span><div className="event-copy"><strong>{sentenceCase(event.event_type)}</strong><span><b>{event.external_id}</b> · {event.source}</span></div><div className="event-meta"><time>{event.occurred_at_raw ?? "Time not recorded"}</time><ProvenanceBadge value={event.provenance} /></div>{event.time_kind === "clock" && <p className="clock-note">Clock only · date and timezone not supplied</p>}</li>)}</ul> : <div className="no-evidence"><Icon name="evidence" /><div><strong>No independent events recorded</strong><p>Recorded claims have no independent event verification in this snapshot.</p></div></div>}

  </section>;



  return <article className="case-detail" aria-label={`${item.job.external_id} case detail`}>

    <div className="order-journey"><section className="order-overview"><h2>Work Order <strong>{item.job.external_id}</strong></h2><dl><div><dt>Recorded stage</dt><dd>{item.stages.map(sentenceCase).join(" / ") || "Not supplied"}</dd></div><div><dt>Recorded owner</dt><dd>{item.owners.map(sentenceCase).join(" / ") || "Not supplied"}</dd></div></dl><AttentionBadge level={item.priority.level} /></section><OperationalJourney item={item} /></div>

    <div className="nova-main-row"><section className="nova-hero" aria-label="NOVA investigation"><NOVAAvatar /><div className="nova-hero-copy"><h3><Icon name="star" />NOVA Investigation</h3><p className="nova-explanation">{copy?.explanation || item.investigationPlan?.uncertainties[0]?.text || item.investigationPlan?.summary || "No investigation guidance available."}</p><div className="nova-recommendation"><h4>NOVA recommends:</h4><p>{copy?.action || item.investigationPlan?.suggestedNextAction.text || "Review the available evidence."}</p></div><details className="nova-why"><summary>Show me why <Icon name="arrow" /></summary>{item.investigationPlan && <InvestigationGuidance plan={item.investigationPlan} decisions={item.decisions} showHumanReview={false} />}</details></div></section>

    <section className="recent-events" aria-label="Recent events"><h3>Recent Events</h3>{item.events.length ? <ul>{item.events.slice(-3).reverse().map(event => <li key={event.id}><span className={`event-dot provenance-${event.provenance.toLowerCase()}`} /><div><strong>{sentenceCase(event.event_type)}</strong>{event.time_kind === "clock" && <small>Clock only · date / timezone not supplied</small>}</div><time>{event.occurred_at_raw ?? "Time not recorded"}</time><ProvenanceBadge value={event.provenance} /></li>)}</ul> : <p>No independent events recorded yet.</p>}</section></div>

    <div className="nova-decision-row">{item.investigationPlan ? <HumanReview key={item.investigationPlan.id} jobId={item.job.id} planId={item.investigationPlan.id} suggestedNextStep={item.investigationPlan.suggestedNextAction.text} decisions={item.decisions ?? []} /> : <section className="human-review"><h3>Your decision</h3><p>Investigation guidance is required before review.</p></section>}<RelatedMemorySection matches={item.relatedMemories ?? []} /></div>

    <div className="secondary-actions"><NovaAlertButton jobId={item.job.id} jobExternalId={item.job.external_id} /><details><summary>Workshop tools &amp; memory</summary><DemoEventButton jobExternalId={item.job.external_id} hasHandoffEvent={hasHandoff} /><CaptureMemory jobId={item.job.id} externalJobId={item.job.external_id} stage={primaryStage} missingCodes={item.missing} decisionId={latestDecision?.id} /></details></div>

    <details className="priority-details"><summary>Why this priority? · Time intelligence</summary><section className="detail-section priority-section"><h3>Operational Attention</h3><p>{item.priority.headline}</p><div className="priority-grid"><div><h4>Why this priority?</h4><ul>{item.priority.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul></div><div><h4>Time intelligence</h4><p>{item.priority.timing.summary}</p><ul>{item.priority.timing.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></div></div></section></details>

    <details className="evidence-inspector"><summary><Icon name="evidence" /><strong>Detailed evidence inspector</strong><span>Source records and rule traces</span><Icon name="arrow" /></summary><div className="inspector-content">

    <div className="trust-note"><Icon name="evidence" /><p>Claims describe what is recorded. Assessments describe what the evidence supports.</p></div>

    {evidenceFirst && evidence}

    <section className="detail-section"><div className="section-heading"><h3>Recorded state</h3><span>Source claims</span></div><dl className="recorded-grid">{item.claims.map(claim => <div key={claim.id}><dt>{propertyLabel(claim.property)}</dt><dd>{sentenceCase(claim.value)}<ProvenanceBadge value={claim.provenance} /></dd></div>)}</dl>{!item.claims.length && <p className="muted">No claims recorded for this work order.</p>}</section>

    {!evidenceFirst && evidence}

    <section className="detail-section assessment-section"><div className="section-heading"><h3>Evidence assessment</h3><span>Claim by claim</span></div><div className="assessment-list">{item.claims.map(claim => {

      const finding = item.findings.find(row => row.subject.claim_id === claim.id);

      if (!finding) return null;

      return <div className="assessment" key={finding.id}><div className="assessment-heading"><div><h4>{propertyLabel(claim.property)}</h4><p>{sentenceCase(claim.value)}</p></div><EvidenceBadge state={finding.classification} /></div>{finding.missing_evidence.length > 0 && <p className="assessment-gap"><span>Missing:</span> {finding.missing_evidence.map(code => missingLabels[code]).join("; ")}</p>}<FindingWhy finding={finding} item={item} /></div>;

    })}</div></section>

    <section className="detail-section missing-section"><div className="section-heading"><h3>What’s missing?</h3><span>Verification requirements</span></div>{item.missing.length ? <ul className="missing-list">{item.missing.map(code => <li key={code}><Icon name="gap" />{missingLabels[code]}</li>)}</ul> : <p className="muted">No missing requirements returned for the evaluated claims.</p>}<p className="section-footnote">These are evidence gaps, not workflow diagnoses or assigned tasks.</p></section>

    </div></details>

  </article>;

}

