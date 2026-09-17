"use client";

import { useState, useTransition } from "react";
import { triggerNovaAlert, type TriggerAlertActionResult } from "@/server/alerts/actions";

export function NovaAlertButton({
  jobId,
  jobExternalId,
}: {
  jobId: string;
  jobExternalId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<TriggerAlertActionResult | null>(null);

  const handleSendAlert = () => {
    setResult(null);
    startTransition(async () => {
      const res = await triggerNovaAlert(jobId, { allowManualResend: true });
      setResult(res);
    });
  };

  return (
    <div className="nova-alert-widget" aria-label="NOVA outbound alert control">
      <div className="nova-alert-action-row">
        <button
          type="button"
          className="nova-alert-button"
          onClick={handleSendAlert}
          disabled={isPending}
        >
          {isPending ? "Evaluating & Sending…" : "Send NOVA Alert"}
        </button>
        <span className="nova-alert-caption">
          Outbound Telegram alert for Work Order {jobExternalId}
        </span>
      </div>

      {result && (
        <div className={`nova-alert-feedback nova-feedback-${result.ok ? result.delivery.status.toLowerCase() : "error"}`}>
          {result.ok ? (
            result.delivery.status === "DELIVERED" ? (
              <p>
                ✓ <strong>Alert dispatched to Telegram</strong> (Message ID: {result.delivery.messageId}
                {result.delivery.chatTitle ? ` in ${result.delivery.chatTitle}` : ""})
              </p>
            ) : result.delivery.status === "NOT_CONFIGURED" ? (
              <div className="nova-not-configured">
                <p>
                  ℹ️ <strong>NOVA Alert Generated</strong> (Telegram delivery skipped: <code>NOT_CONFIGURED</code>)
                </p>
                <small>Configure <code>TELEGRAM_BOT_TOKEN</code> and <code>TELEGRAM_CHAT_ID</code> in <code>.env.local</code> for live delivery.</small>
              </div>
            ) : result.delivery.status === "ALREADY_SENT" ? (
              <p>
                ℹ️ <strong>Alert already sent</strong> for this exact operational state (Fingerprint: <code>{result.delivery.fingerprint}</code>).
              </p>
            ) : (
              <p>
                ⚠️ <strong>Alert generation succeeded, but Telegram delivery failed:</strong> {result.delivery.error}
              </p>
            )
          ) : (
            <p className="nova-error-msg">⚠️ {result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

