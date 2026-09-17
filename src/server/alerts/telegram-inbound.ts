import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SupabaseSimulationRepository } from "@/server/simulation/repository";
import { getActiveSimulationState, approvePipelineTransition } from "@/server/simulation/service";
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

/** Reads the allowed chat id without ever logging or returning the bot token. */
export function getAllowedChatId(): number | null {
  const raw = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Single authorization rule: only the configured chat may issue commands. */
export function isAuthorizedChat(chatId: number, allowedChatId: number | null): boolean {
  return allowedChatId !== null && chatId === allowedChatId;
}

let lastOffset = 0;

/** Polls the Telegram Bot API once and processes authorized approve/status
 * commands. Unauthorized chats are ignored and can never mutate state. */
export async function pollTelegramInboundUpdates(): Promise<{
  processed: number;
  approved: boolean;
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const allowedChatId = getAllowedChatId();

  if (!token || allowedChatId === null) {
    return { processed: 0, approved: false };
  }

  let processedCount = 0;
  let approvedCount = 0;

  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastOffset}&timeout=0`;
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { processed: 0, approved: false };

    const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
    if (!data.ok || !data.result || !Array.isArray(data.result)) {
      return { processed: 0, approved: false };
    }

    const repo = new SupabaseSimulationRepository(createSupabaseAdminClient());

    for (const update of data.result) {
      lastOffset = Math.max(lastOffset, update.update_id + 1);
      const msg = update.message;
      if (!msg || !msg.text) continue;

      // SECURITY: reject every chat that is not the configured chat.
      if (!isAuthorizedChat(msg.chat.id, allowedChatId)) continue;

      processedCount++;
      const text = msg.text.trim().toLowerCase();

      if (text === "approve" || text === "/approve") {
        const state = await getActiveSimulationState(repo);
        if (!state) {
          await sendTelegramCustomMessage("⚠️ <b>NOVA</b>: No active simulation run yet.");
          continue;
        }
        if (state.runStatus === "COMPLETED") {
          await sendTelegramCustomMessage(
            `ℹ️ <b>NOVA</b>: <b>${state.externalId}</b> is already completed.`,
          );
          continue;
        }
        if (state.incidentActive) {
          await sendTelegramCustomMessage(
            `⚠️ <b>NOVA cannot continue yet.</b>\n\nRequired evidence:\nPart-to-job handoff confirmation.\n\nConfirm handoff in the web UI first.`,
          );
          continue;
        }

        // Call the SAME authoritative approval service as the web UI.
        const result = await approvePipelineTransition(
          repo,
          state.runId,
          "TELEGRAM",
          msg.from?.first_name || "Telegram User",
        );

        if (result.ok) {
          approvedCount++;
          const label = result.state.currentStage.replaceAll("_", " ");
          await sendTelegramCustomMessage(
            `✓ <b>Approved from Telegram</b>\n\n🚗 <b>${state.externalId}</b> advanced to:\n<b>${label}</b>\n\nNOVA will notify you when the next decision is required.`,
          );
        } else {
          await sendTelegramCustomMessage(`❌ <b>NOVA Approval Failed</b>: ${result.error}`);
        }
      } else if (text === "status" || text === "/status") {
        const state = await getActiveSimulationState(repo);
        if (!state) {
          await sendTelegramCustomMessage("📊 <b>NOVA Pipeline Status</b>\n\nNo active simulation run.");
        } else {
          const currentLabel = state.currentStage.replaceAll("_", " ");
          const nextLabel = state.nextStage ? state.nextStage.replaceAll("_", " ") : "Complete";
          const statusLabel =
            state.runStatus === "COMPLETED"
              ? "Completed"
              : state.incidentActive
                ? "Waiting for evidence"
                : "Waiting for approval";
          await sendTelegramCustomMessage(
            `📊 <b>NOVA — Pipeline Status</b>\n\n🚗 <b>${state.externalId}</b>\n\nCurrent:\n<b>${currentLabel}</b>\n\nNext:\n<b>${nextLabel}</b>\n\nStatus:\n<i>${statusLabel}</i>`,
          );
        }
      } else {
        await sendTelegramCustomMessage("Available commands: approve, status");
      }
    }
  } catch {
    // Network errors are best-effort; never crash the demo.
  }

  return { processed: processedCount, approved: approvedCount > 0 };
}
