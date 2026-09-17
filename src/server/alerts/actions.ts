"use server";

import { revalidatePath } from "next/cache";
import { loadOperationalWorkspace } from "@/server/control-tower/loader";
import { evaluateEvidence } from "@/domain/evidence-engine";
import { DeterministicInvestigationProvider } from "@/server/investigation/provider";
import { evaluateCasePriority } from "@/domain/prioritization";
import { evaluateNovaAlert, type NovaAlert, type NovaAlertDeliveryResult } from "@/domain/nova-alert";
import { sendTelegramAlert } from "@/server/alerts/telegram";

export type TriggerAlertActionResult =
  | { ok: true; alert: NovaAlert; delivery: NovaAlertDeliveryResult }
  | { ok: false; error: string; alert?: NovaAlert | null; delivery?: NovaAlertDeliveryResult };

const investigationProvider = new DeterministicInvestigationProvider();

/**
 * Server action to trigger a NOVA Alert for a specified work order.
 * Reconstructs alert strictly from current trusted server state.
 * Never accepts arbitrary message content from the client.
 */
export async function triggerNovaAlert(
  jobId: string,
  options: { allowManualResend?: boolean } = {},
): Promise<TriggerAlertActionResult> {
  try {
    const workspace = await loadOperationalWorkspace();
    const findings = evaluateEvidence(workspace.snapshot);
    const job = workspace.snapshot.jobs.find(j => j.id === jobId);

    if (!job) {
      return { ok: false, error: `Work order not found for ID: ${jobId}` };
    }

    const claims = workspace.snapshot.claims.filter(c => c.job_id === job.id);
    const events = workspace.snapshot.events.filter(e => e.job_id === job.id);
    const jobFindings = findings.filter(f => f.job_id === job.id);

    const plan = await investigationProvider.generate({
      job,
      claims,
      events,
      findings: jobFindings,
    });

    const priority = evaluateCasePriority({
      job,
      claims,
      events,
      findings: jobFindings,
      decisions: workspace.decisions.filter(d => d.jobId === job.id),
      suggestedActionText: plan?.suggestedNextAction?.text,
    });

    const alert = evaluateNovaAlert({
      job,
      claims,
      events,
      findings: jobFindings,
      priority,
      suggestedActionText: plan?.suggestedNextAction?.text,
    });

    if (!alert) {
      return {
        ok: false,
        error: "NOVA alert policy: Case does not meet criteria for human notification.",
      };
    }

    const delivery = await sendTelegramAlert(alert, {
      allowManualResend: options.allowManualResend ?? true,
    });

    try {
      revalidatePath("/");
    } catch {
      // revalidatePath may throw when executed outside Next request lifecycle (e.g. CLI/tests)
    }

    return {
      ok: true,
      alert,
      delivery,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to evaluate and send NOVA alert.",
    };
  }
}

