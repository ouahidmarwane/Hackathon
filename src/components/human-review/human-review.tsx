"use client";

import { useId, useMemo, useState, useTransition } from "react";
import type { HumanDecision } from "@/domain/human-decision";
import { submitHumanDecision } from "@/server/decision/actions";
import { ProvenanceBadge } from "@/components/control-tower/badges";
import { Icon } from "@/components/control-tower/icons";

// UTC hour:minute from the persisted instant; deterministic and hydration-safe.
const timeLabel = (iso: string) => new Date(iso).toISOString().slice(11, 16);

export function HumanReview({
  jobId, planId, suggestedNextStep, decisions,
}: {
  jobId: string;
  planId: string;
  suggestedNextStep: string;
  decisions: HumanDecision[];
}) {
  const formId = useId();
  const [appended, setAppended] = useState<HumanDecision[]>([]);
  const [correcting, setCorrecting] = useState(false);
  const [correctionText, setCorrectionText] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [humanEvidenceReference, setHumanEvidenceReference] = useState("");
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const all = useMemo(() => {
    const byId = new Map<string, HumanDecision>();
    for (const decision of [...decisions, ...appended]) byId.set(decision.id, decision);
    return [...byId.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
  }, [decisions, appended]);

  const latest = all[all.length - 1];
  const correctionReady = correctionText.trim().length > 0;

  const approve = () => {
    startTransition(async () => {
      setError(undefined);
      const result = await submitHumanDecision({
        jobId, investigationPlanId: planId, decisionType: "APPROVED",
        selectedNextStep: suggestedNextStep,
      });
      if (result.ok) { setAppended(previous => [...previous, result.decision]); setCorrecting(false); }
      else setError(result.error);
    });
  };

  const saveCorrection = () => {
    startTransition(async () => {
      setError(undefined);
      const result = await submitHumanDecision({
        jobId, investigationPlanId: planId, decisionType: "CORRECTED",
        selectedNextStep: suggestedNextStep,
        correctionText: correctionText.trim(),
        correctionReason: correctionReason.trim() || undefined,
        humanEvidenceReference: humanEvidenceReference.trim() || undefined,
      });
      if (result.ok) {
        setAppended(previous => [...previous, result.decision]);
        setCorrecting(false); setCorrectionText(""); setCorrectionReason("");
        setHumanEvidenceReference("");
      } else setError(result.error);
    });
  };

  return <section className="human-review" aria-label="Human review">
    <div className="human-review-heading"><h4>Your decision</h4><span>NOVA proposes. You decide.</span></div>
    <div className="human-review-next"><strong>Suggested next step</strong><p>{suggestedNextStep}</p></div>
    {latest?.decisionType === "APPROVED" && <div className="human-review-state approved"><Icon name="check" /><span>Human reviewed · Investigation path approved</span></div>}
    {latest?.decisionType === "CORRECTED" && <div className="human-review-state corrected"><Icon name="pencil" /><span>Human correction recorded</span></div>}
    <div className="human-review-actions">
      <button type="button" className="approve-button" onClick={approve} disabled={isPending} aria-label="Approve investigation"><Icon name="check" />Approve</button>
      <button type="button" className="correct-button" onClick={() => setCorrecting(value => !value)} disabled={isPending} aria-expanded={correcting} aria-controls={formId}><Icon name="pencil" />Correct</button>
    </div>
    {correcting && <form id={formId} className="correction-form" onSubmit={event => { event.preventDefault(); if (correctionReady) saveCorrection(); }}>
      <label htmlFor={formId + "-text"}>Correction<span>Required</span></label>
      <textarea id={formId + "-text"} value={correctionText} onChange={event => setCorrectionText(event.target.value)} maxLength={1000} rows={3} placeholder="Describe what the generated investigation got wrong…" required />
      <label htmlFor={formId + "-reason"}>Reason <span>Optional</span></label>
      <input id={formId + "-reason"} value={correctionReason} onChange={event => setCorrectionReason(event.target.value)} maxLength={200} placeholder="Why this correction is needed" />
      <label htmlFor={formId + "-reference"}>Evidence / reference <span>Optional</span></label>
      <input id={formId + "-reference"} value={humanEvidenceReference} onChange={event => setHumanEvidenceReference(event.target.value)} maxLength={200} placeholder="Optional reference or source" />
      <div className="correction-form-actions"><button type="submit" className="save-button" disabled={!correctionReady || isPending}>Save correction</button><button type="button" className="cancel-button" onClick={() => setCorrecting(false)}>Cancel</button></div>
    </form>}
    {error && <p className="human-review-error" role="alert">{error}</p>}
    <p className="decision-scope">Approve the investigation path. The workflow stage stays unchanged.</p>
    <details className="decision-history">
      <summary>Decision history</summary>
      {all.length ? <ul>{all.map(decision => <li key={decision.id} className={`decision-item ${decision.decisionType.toLowerCase()}`}>
        <time dateTime={decision.createdAt}>{timeLabel(decision.createdAt)}</time>
        <strong>{decision.decisionType === "APPROVED" ? "Investigation path approved" : "Human correction"}</strong>
        <ProvenanceBadge value={decision.provenance} />
        {decision.decisionType === "CORRECTED" && decision.correctionText && <p>{decision.correctionText}</p>}
        <small>{decision.reviewer}</small>
      </li>)}</ul> : <p className="decision-history-empty">No human decision recorded yet.</p>}
    </details>
  </section>;
}
