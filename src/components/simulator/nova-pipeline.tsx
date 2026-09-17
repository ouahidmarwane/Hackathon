"use client";

import { useCallback, useEffect, useState } from "react";
import {
  startSimulationAction,
  approvePipelineWebAction,
  confirmHandoffAction,
  fetchSimulationStateAction,
  pollTelegramInboundAction,
} from "@/server/simulation/actions";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineState,
} from "@/domain/pipeline-simulation";

const POLL_MS = 1000;

export function NovaPipeline() {
  const [run, setRun] = useState<PipelineState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = !!run && run.runStatus !== "COMPLETED";

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchSimulationStateAction();
        if (!cancelled) setRun(next);
      } catch {
        // A transient read failure should not crash the panel.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Lightweight polling only while a simulation exists and is not complete.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const next = await fetchSimulationStateAction();
          setRun(next);
        } catch {
          // Keep the last known state on transient failures.
        }
      })();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active]);

  // Inbound Telegram commands are polled while the pipeline is active so an
  // approve sent from a phone moves this screen without a manual reload.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      void (async () => {
        try {
          await pollTelegramInboundAction();
        } catch {
          // Telegram is best-effort; never break the demo on delivery errors.
        }
      })();
    }, 2000);
    return () => clearInterval(timer);
  }, [active]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await startSimulationAction();
    setBusy(false);
    if (result.ok) setRun(result.state);
    else setError(result.error);
  }, []);

  const approve = useCallback(async () => {
    if (!run) return;
    setBusy(true);
    setError(null);
    const result = await approvePipelineWebAction(run.runId);
    setBusy(false);
    if (result.ok) setRun(result.state);
    else setError(result.error);
  }, [run]);

  const confirmHandoff = useCallback(async () => {
    if (!run) return;
    setBusy(true);
    setError(null);
    const result = await confirmHandoffAction(run.runId);
    setBusy(false);
    if (result.ok) setRun(result.state);
    else setError(result.error);
  }, [run]);

  if (!run) {
    return (
      <section className="nova-pipeline" aria-label="NOVA Live Pipeline">
        <div className="nova-pipeline-hero">
          <div>
            <span className="nova-pipeline-kicker">Live demonstration</span>
            <h1>NOVA Live Workshop Pipeline</h1>
            <p>
              Watch NOVA observe, evaluate and explain a workshop job — then move it forward
              only when a human approves each step.
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nova-robot.png" alt="NOVA" className="nova-pipeline-robot" />
        </div>
        <button type="button" className="nova-run-button" onClick={start} disabled={busy}>
          {busy ? "Starting…" : "▶ Run NOVA Pipeline"}
        </button>
        {error && <p className="nova-pipeline-error" role="alert">{error}</p>}
      </section>
    );
  }

  const currentIndex = PIPELINE_STAGES.indexOf(run.currentStage);

  return (
    <section className="nova-pipeline" aria-label="NOVA Live Pipeline">
      <div className="nova-pipeline-top">
        <div>
          <span className="nova-pipeline-kicker">
            LIVE SIMULATION · <strong>SYNTHETIC</strong>
          </span>
          <h1>{run.externalId}</h1>
        </div>
        <span className={`nova-run-status nova-status-${run.runStatus.toLowerCase()}`}>
          {run.runStatus === "COMPLETED" ? "✓ Workflow complete" : run.runStatus === "BLOCKED" ? "Waiting for evidence" : "Running"}
        </span>
      </div>

      <ol className="nova-stages" aria-label="Pipeline stages">
        {PIPELINE_STAGES.map((stage, index) => {
          const state =
            run.runStatus === "COMPLETED" || index < currentIndex
              ? "completed"
              : index === currentIndex
                ? run.incidentActive
                  ? "blocked"
                  : "current"
                : "future";
          return (
            <li key={stage} className={`nova-stage nova-stage-${state}`} data-stage={stage}>
              <span className="nova-stage-dot" aria-hidden="true" />
              <span className="nova-stage-label">{PIPELINE_STAGE_LABELS[stage]}</span>
              {state === "completed" && <span className="nova-stage-check">✓</span>}
              {state === "blocked" && <span className="nova-stage-flag">⚠</span>}
            </li>
          );
        })}
      </ol>

      <div className="nova-pipeline-body">
        <div className="nova-assistant-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nova-robot.png" alt="" className="nova-assistant-avatar" />
          <div className="nova-assistant-copy">
            <span className="nova-assistant-name">NOVA</span>
            <p className="nova-assistant-message">{run.novaMessage}</p>
            <p className="nova-assistant-next">
              <strong>Recommended next step:</strong> {run.suggestedNextStep}
            </p>
          </div>
        </div>

        <div className="nova-pipeline-actions">
          {run.incidentActive ? (
            <button type="button" className="nova-action-button nova-action-evidence" onClick={confirmHandoff} disabled={busy}>
              {busy ? "Confirming…" : "Confirm handoff"}
            </button>
          ) : run.runStatus !== "COMPLETED" ? (
            <button type="button" className="nova-action-button nova-action-approve" onClick={approve} disabled={busy}>
              {busy ? "Approving…" : "✓ Approve next step"}
            </button>
          ) : (
            <span className="nova-complete-badge">✓ Workflow complete</span>
          )}
        </div>
        {error && <p className="nova-pipeline-error" role="alert">{error}</p>}
      </div>

      <div className="nova-pipeline-history">
        <section>
          <h3>Approval history</h3>
          {run.approvals.length ? (
            <ul className="nova-history-list">
              {run.approvals.map((approval, index) => (
                <li key={index}>
                  <span className="nova-history-transition">
                    {approval.fromStage.replaceAll("_", " ")} → {approval.toStage.replaceAll("_", " ")}
                  </span>
                  <span className="nova-history-channel">{approval.channel}</span>
                  <span className="nova-history-provenance">HUMAN VALIDATED</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nova-history-empty">No approvals recorded yet.</p>
          )}
        </section>
        <section>
          <h3>Recent events</h3>
          <ul className="nova-history-list">
            <li>
              <span className="nova-history-transition">Simulation started</span>
              <span className="nova-history-channel">SYNTHETIC</span>
            </li>
            {run.events.map((event, index) => (
              <li key={index}>
                <span className="nova-history-transition">{event.eventType}</span>
                <span className="nova-history-channel">{event.provenance}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
