"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ingestEvent, type ProducerContext } from "@/server/ingestion/events";
import { SupabaseOperationalRepository } from "@/server/ingestion/supabase-repository";
import type { EventInput, EventRecord } from "@/domain/operational-model";

export type IngestActionResult =
  | { ok: true; event: EventRecord }
  | { ok: false; error: string };

/**
 * Server-only action to inject a predefined synthetic handoff event for demo.
 * Reject browser overrides: event classification, status, provenance and context
 * are strictly constructed server-side.
 */
export async function injectDemoHandoffEvent(
  jobExternalId = "W-1",
): Promise<IngestActionResult> {
  try {
    const input: EventInput = {
      job: { source: "c02-supplied", external_id: jobExternalId },
      external_id: `SYN-HANDOFF-${jobExternalId}`,
      event_type: "part handoff confirmed",
      provenance: "SYNTHETIC",
      time: { kind: "unknown" },
    };
    const context: ProducerContext = {
      kind: "synthetic",
      source: "synthetic:demo",
      producer: "prototype demo",
    };

    const client = createSupabaseAdminClient();
    const repository = new SupabaseOperationalRepository(client);
    const event = await ingestEvent(input, context, repository);

    // M10 / M11 Automatic Event Hook: Best-effort alert evaluation & delivery.
    // Core event ingestion succeeds even if alert delivery is unconfigured or fails.
    try {
      const { triggerNovaAlert } = await import("@/server/alerts/actions");
      await triggerNovaAlert(event.job_id, { allowManualResend: false });
    } catch {
      // Best-effort delivery must never fail ingestion
    }

    revalidatePath("/");
    return { ok: true, event };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to inject demo event.",
    };
  }
}

