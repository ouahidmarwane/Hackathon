"use client";

import { useTransition, useState } from "react";
import { injectDemoHandoffEvent } from "@/server/ingestion/actions";
import { ProvenanceBadge } from "@/components/control-tower/badges";

export function DemoEventButton({
  jobExternalId,
  hasHandoffEvent,
}: {
  jobExternalId: string;
  hasHandoffEvent: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (jobExternalId !== "W-1") return null;

  const handleInject = () => {
    setError(null);
    startTransition(async () => {
      const result = await injectDemoHandoffEvent(jobExternalId);
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  return (
    <div className="demo-event-widget" role="region" aria-label="Developer Simulation">
      <div className="demo-event-header">
        <span className="demo-tag">SIMULATION</span>
        <ProvenanceBadge value="SYNTHETIC" />
      </div>
      <div className="demo-event-body">
        {hasHandoffEvent ? (
          <div className="demo-event-status">
            <span className="demo-event-check">✓</span>
            <span>Simulated handoff event present (SYN-HANDOFF-{jobExternalId})</span>
          </div>
        ) : (
          <div className="demo-event-action">
            <p>Simulate part-to-job handoff confirmation event:</p>
            <button
              type="button"
              className="demo-inject-button"
              onClick={handleInject}
              disabled={isPending}
            >
              {isPending ? "Injecting event…" : "Inject simulated handoff event"}
            </button>
          </div>
        )}
        {error && <p className="demo-event-error">{error}</p>}
      </div>
    </div>
  );
}

