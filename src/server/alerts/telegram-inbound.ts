import "server-only";

import {
  getActiveSimulationState,
  approvePipelineTransition,
} from "@/server/simulation/service";
import { sendTelegramCustomMessage } from "@/server/alerts/telegram";

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; title?: string; type: string };
    date: number;
    text?: string;
  };
};

let lastOffset = 0;
let isPolling = false;

/**
 * Poll Telegram updates once for authorized chat.
 * Strictly verifies TELEGRAM_CHAT_ID.
 */
export async function pollTelegramInboundUpdates(): Promise<{
  processed: number;
  approved: boolean;
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const allowedChatIdStr = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!token || !allowedChatIdStr) {
    return { processed: 0, approved: false };
  }

  const allowedChatId = Number(allowedChatIdStr);
  let approvedCount = 0;
  let processedCount = 0;

  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastOffset}&timeout=0`;
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return { processed: 0, approved: false };

    const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
    if (!data.ok || !data.result || !Array.isArray(data.result)) {
      return { processed: 0, approved: false };
    }

    for (const update of data.result) {
      lastOffset = Math.max(lastOffset, update.update_id + 1);

      const msg = update.message;
      if (!msg || !msg.text) continue;

      // SECURITY RULE: Reject updates from any unauthorized chat ID
      if (msg.chat.id !== allowedChatId) {
        continue;
      }

      processedCount++;
      const text = msg.text.trim().toLowerCase();

      if (text === "approve" || text === "/approve") {
        const simState = await getActiveSimulationState();

        if (!simState) {
          await sendTelegramCustomMessage(
            `⚠️ <b>NOVA</b>: No active simulation run currently waiting for approval.`
          );
          continue;
        }

        if (simState.status === "COMPLETED") {
          await sendTelegramCustomMessage(
            `ℹ️ <b>NOVA</b>: Simulation <b>${simState.externalJobId}</b> is already completed.`
          );
          continue;
        }

        if (simState.incidentActive) {
          await sendTelegramCustomMessage(
            `⚠️ <b>NOVA</b>: <b>${simState.externalJobId}</b> is paused at Parts / Approval due to a missing handoff event. Confirm handoff in the web UI first.`
          );
          continue;
        }

        // Call the SAME authoritative approval service
        const result = await approvePipelineTransition(
          simState.runId,
          "TELEGRAM",
          msg.from?.first_name || "Telegram User"
        );

        if (result.ok) {
          approvedCount++;
          const newStageLabel = result.state.currentStage.replace("_", " ");
          await sendTelegramCustomMessage(
            `✓ <b>Approved from Telegram</b>\n\n🚗 <b>${simState.externalJobId}</b> advanced to:\n<b>${newStageLabel}</b>\n\nNOVA will notify you when the next decision is required.`
          );
        } else {
          await sendTelegramCustomMessage(
            `❌ <b>NOVA Approval Failed</b>: ${result.error}`
          );
        }
      } else if (text === "status" || text === "/status") {
        const simState = await getActiveSimulationState();

        if (!simState) {
          await sendTelegramCustomMessage(
            `📊 <b>NOVA Pipeline Status</b>\n\nNo active simulation run.`
          );
        } else {
          const currentLabel = simState.currentStage.replace("_", " ");
          const nextLabel = simState.nextStage ? simState.nextStage.replace("_", " ") : "None";
          const statusLabel =
            simState.status === "COMPLETED"
              ? "Completed"
              : simState.incidentActive
              ? "Waiting for incident resolution"
              : "Waiting for human approval";

          await sendTelegramCustomMessage(
            `📊 <b>NOVA Pipeline Status</b>\n\n🚗 <b>${simState.externalJobId}</b>\n\nCurrent: <b>${currentLabel}</b>\nNext: <b>${nextLabel}</b>\nStatus: <i>${statusLabel}</i>`
          );
        }
      }
    }
  } catch {
    // Graceful handling of network timeouts
  }

  return { processed: processedCount, approved: approvedCount > 0 };
}

