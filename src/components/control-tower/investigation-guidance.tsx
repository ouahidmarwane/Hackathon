import type { InvestigationPlan, InvestigationStatement } from "@/domain/investigation";
import type { HumanDecision } from "@/domain/human-decision";
import { HumanReview } from "@/components/human-review/human-review";
import { ProvenanceBadge } from "./badges";

function Statements({ items, ordered = false }: { items: InvestigationStatement[]; ordered?: boolean }) {
  const children = items.map((item, index) => <li key={index}>{item.text}</li>);
  return ordered ? <ol>{children}</ol> : <ul>{children}</ul>;
}

export function InvestigationGuidance({ plan, decisions = [], showHumanReview = true }: { plan: InvestigationPlan; decisions?: HumanDecision[]; showHumanReview?: boolean }) {
  const ownerState = { NOT_RECORDED: "No next owner recorded; verify the assignment in the authoritative source.",
    NOT_INDEPENDENTLY_VERIFIED: "Assignment not independently verified. Start with the recorded role while verifying the assignment.",
    SUPPORTED: "The exact recorded assignment is supported; this does not assign responsibility or blame.",
    CONFLICTING_EVIDENCE: "Assignment has conflicting evidence; verify it before relying on the recorded role." }[plan.ownerVerificationState];
  return <section className="investigation-guidance" aria-label="Investigation intelligence">
    <div className="section-heading"><h4>{plan.title}</h4><ProvenanceBadge value={plan.provenance} /></div><p>{plan.summary}</p>
    <div className="investigation-columns"><section><h4>What we know</h4><Statements items={plan.knownFacts} />{!plan.knownFacts.length && <p>No source facts supplied for this investigation.</p>}</section>
      <section><h4>What’s uncertain</h4><Statements items={plan.uncertainties} />{!plan.uncertainties.length && <p>No unresolved requirement reported; this does not certify operational readiness.</p>}</section></div>
    <section className="investigation-required"><h4>What to verify</h4><Statements items={plan.investigationSteps} ordered /></section>
    <section className="investigation-required"><h4>Recorded next owner</h4><Statements items={plan.recordedOwners} /><p>{ownerState}</p></section>
    <section className="investigation-required"><h4>Suggested next step</h4><p><strong>{plan.suggestedNextAction.text}</strong></p><p>{plan.abstention}</p></section>
    {showHumanReview && <HumanReview jobId={plan.jobId} planId={plan.id} suggestedNextStep={plan.suggestedNextAction.text} decisions={decisions} />}
    <details className="why"><summary>Why this investigation?</summary><div className="why-content"><Statements items={plan.rationale} />
      <dl className="trace-grid"><div><dt>Provider / version</dt><dd><code>{plan.producer}</code><code>{plan.version}</code></dd></div>
        <div><dt>Source findings</dt><dd>{plan.sourceFindingIds.map(id => <code key={id}>{id}</code>)}</dd></div>
        <div><dt>Source claims</dt><dd>{plan.sourceClaimIds.map(id => <code key={id}>{id}</code>)}</dd></div>
        <div><dt>Source events</dt><dd>{plan.sourceEventIds.length ? plan.sourceEventIds.map(id => <code key={id}>{id}</code>) : "None"}</dd></div>
        <div><dt>Missing evidence codes</dt><dd>{plan.missingEvidence.map(item => <code key={item.code}>{item.code}</code>)}</dd></div>
        <div><dt>Source dependency</dt><dd>{plan.dependsOnSynthetic ? "Includes synthetic source dependency" : "No synthetic source dependency"}</dd></div></dl>
      <details className="why"><summary>Statement grounding</summary>{[...plan.knownFacts, ...plan.uncertainties, ...plan.investigationSteps, ...plan.recordedOwners, plan.suggestedNextAction, ...plan.rationale].map((item, index) => <div key={index}><p>{item.text}</p><code>{item.trace.ruleId}</code>{[...item.trace.sourceClaimIds, ...item.trace.sourceEventIds, ...item.trace.sourceFindingIds, ...item.trace.missingEvidenceCodes].map((id, reference) => <code key={reference}>{id}</code>)}</div>)}</details>
    </div></details>
  </section>;
}
