import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { loadOperationalWorkspace } from "@/server/control-tower/loader";
import { triggerNovaAlert } from "@/server/alerts/actions";

const hasLiveCredentials = (() => {
  try {
    const content = readFileSync(".env.local", "utf8");
    return /^SUPABASE_SERVICE_ROLE_KEY=.+/m.test(content) && /^TELEGRAM_BOT_TOKEN=.+/m.test(content);
  } catch {
    return false;
  }
})();

const runLive = process.env.RUN_LIVE_TESTS === "1" && hasLiveCredentials;

describe.skipIf(!runLive)("M10 live Telegram delivery verification", () => {
  let w1JobId: string;

  beforeAll(async () => {
    const content = readFileSync(".env.local", "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)?$/);
      if (match && match[1] && match[2] !== undefined && !process.env[match[1].trim()]) {
        process.env[match[1].trim()] = match[2].trim();
      }
    }
    vi.stubEnv("NODE_ENV", "development");
    const ws = await loadOperationalWorkspace();
    const w1 = ws.snapshot.jobs.find(j => j.external_id === "W-1");
    if (!w1) throw new Error("W-1 not found in snapshot");
    w1JobId = w1.id;
  });

  it("sends exactly ONE real NOVA test alert through the trusted server-side alert flow", async () => {
    const result = await triggerNovaAlert(w1JobId, { allowManualResend: true });

    if (!result.ok) {
      expect(result.error).toBeUndefined();
    }
    expect(result.ok).toBe(true);

    if (!result.ok) throw new Error(result.error);
    expect(result.alert).toBeDefined();
    expect(result.alert.externalJobId).toBe("W-1");
    expect(result.alert.producer).toBe("NOVA Operational Intelligence Agent");

    expect(result.delivery.status).toBe("DELIVERED");
    if (result.delivery.status === "DELIVERED") {
      expect(typeof result.delivery.messageId).toBe("string");
      expect(result.delivery.messageId.length).toBeGreaterThan(0);
    }
  }, 15000);
});
