import "server-only";
import { formatTelegramMessage, type NovaAlert, type NovaAlertDeliveryResult } from "@/domain/nova-alert";

/**
 * Global in-memory sent alert fingerprint cache.
 * Ensures deduplication across automatic event injections and demo triggers.
 */
const sentAlertFingerprints = new Set<string>();

export function isAlertAlreadySent(fingerprint: string): boolean {
  return sentAlertFingerprints.has(fingerprint);
}

export function markAlertAsSent(fingerprint: string): void {
  sentAlertFingerprints.add(fingerprint);
}

export function clearAlertHistory(): void {
  sentAlertFingerprints.clear();
}

/**
 * Server-only Telegram notification dispatcher.
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID safely from process.env.
 * Never leaks or prints credentials.
 * Fails gracefully with NOT_CONFIGURED when environment variables are absent.
 */
export async function sendTelegramAlert(
  alert: NovaAlert,
  options: { allowManualResend?: boolean } = {},
): Promise<NovaAlertDeliveryResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!token || !chatId) {
    return {
      status: "NOT_CONFIGURED",
      reason: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured in local environment.",
    };
  }

  // Deduplication check
  if (!options.allowManualResend && isAlertAlreadySent(alert.id)) {
    return {
      status: "ALREADY_SENT",
      fingerprint: alert.id,
    };
  }

  const messageText = formatTelegramMessage(alert);
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      // Fast timeout to avoid blocking operational paths
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      return {
        status: "FAILED",
        error: `Telegram API responded with HTTP ${res.status}: ${errorBody.slice(0, 120)}`,
      };
    }

    const data = (await res.json()) as { ok: boolean; result?: { message_id: number; chat?: { title?: string } } };
    if (!data.ok || !data.result) {
      return {
        status: "FAILED",
        error: "Telegram API response indicated failure.",
      };
    }

    markAlertAsSent(alert.id);

    return {
      status: "DELIVERED",
      messageId: String(data.result.message_id),
      chatTitle: data.result.chat?.title,
    };
  } catch (error) {
    return {
      status: "FAILED",
      error: error instanceof Error ? error.message : "Network error contacting Telegram API.",
    };
  }
}

/**
 * Server-only helper to send a custom Telegram notification to configured chat.
 * Respects TELEGRAM_CHAT_ID security restrictions.
 */
export async function sendTelegramCustomMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return false;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}


