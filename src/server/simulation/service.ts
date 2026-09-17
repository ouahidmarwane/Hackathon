import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SupabaseOperationalRepository } from "@/server/ingestion/supabase-repository";
import { SupabaseDecisionRepository } from "@/server/decision/supabase-repository";
import { ingestEvent, type ProducerContext } from "@/server/ingestion/events";
import { recordHumanDecision } from "@/server/decision/service";
import { loadOperationalSnapshot, loadOperationalWorkspace } from "@/server/control-tower/loader";
import { evaluateEvidence } from "@/domain/evidence-engine";
import { DeterministicInvestigationProvider } from "@/server/investigation/provider";
import type { EventInput, EventRecord, JobRecord, ClaimRecord } from "@/domain/operational-model";
import type { HumanDecision } from "@/domain/human-decision";
import {
  type PipelineStage,
  type SimulationApprovalSource,
  type PipelineState,
  PIPELINE_STAGES,
  ALLOWED_TRANSITIONS,
  getNextStage,
} from "@/domain/pipeline-simulation";
import { formatTelegramMessage, type NovaAlert } from "@/domain/nova-alert";

export type TransitionResult =
  | { ok: true; state: PipelineState; decision?: HumanDecision; event?: EventRecord }
  | { ok: false; error: string; code?: string };

const investigationProvider = new DeterministicInvestigationProvider();

// Shared in-memory active simulation run tracker for single active run policy
let activeRunId: string | null = null;

/**
 * Gets or creates the active simulation run state by querying the real Supabase snapshot.
 */
export async function getActiveSimulationState(targetRunId?: string): Promise<PipelineState | null> {
  const snapshot = await loadOperationalSnapshot();
  const simJobs = snapshot.jobs.filter((j) => j.external_id.startsWith("SIM-"));

  if (simJobs.length === 0) return null;

  // Pick target run or latest run
  const job = targetRunId
    ? simJobs.find((j) => j.external_id === targetRunId || j.id === targetRunId)
    : simJobs[simJobs.length - 1];

  if (!job) return null;

  const events = snapshot.events.filter((e) => e.job_id === job.id);
  const claims = snapshot.claims.filter((c) => c.job_id === job.id);

  // Determine stage & status based on append-only events
  let currentStage: PipelineStage = "RECEPTION";
  const stageEvents = events.filter((e) => e.event_type.startsWith("stage:"));

  for (const se of stageEvents) {
    const rawStage = se.event_type.replace("stage:", "").toUpperCase() as PipelineStage;
    if (PIPELINE_STAGES.includes(rawStage)) {
      currentStage = rawStage;
    }
  }

  const nextStage = getNextStage(currentStage);
  const hasHandoff = events.some((e) => /part.*handoff/i.test(e.event_type));

  // Incident occurs at PARTS_APPROVAL if handoff event is missing
  const incidentActive = currentStage === "PARTS_APPROVAL" && !hasHandoff;
  const isCompleted = currentStage === "COLLECTION";

  const status = isCompleted
    ? "COMPLETED"
    : incidentActive
    ? "WAITING_INCIDENT_RESOLUTION"
    : "WAITING_APPROVAL";

  return {
    runId: job.id,
    externalJobId: job.external_id,
    currentStage,
    nextStage,
    status,
    incidentActive,
    incidentType: incidentActive ? "HANDOFF_MISSING" : undefined,
    createdAt: job.producer, // Stores creation metadata
    updatedAt: events[events.length - 1]?.occurred_at || new Date().toISOString(),
  };
}

/**
 * Start a new SIMULATION run (e.g., SIM-001, SIM-002).
 */
export async function startSimulationRun(): Promise<{ ok: true; state: PipelineState } | { ok: false; error: string }> {
  try {
    const snapshot = await loadOperationalSnapshot();
    const existingSims = snapshot.jobs.filter((j) => j.external_id.startsWith("SIM-"));
    const nextNum = existingSims.length + 1;
    const externalId = `SIM-${String(nextNum).padStart(3, "0")}`;

    const client = createSupabaseAdminClient();

    // 1. Create Synthetic Job Record
    const jobRecord: JobRecord = {
      id: `job:synthetic:${externalId}`,
      source: "synthetic:simulation",
      external_id: externalId,
      provenance: "SYNTHETIC",
      producer: new Date().toISOString(),
    };

    const repo = new SupabaseOperationalRepository(client);
    await repo.appendJob(jobRecord);

    // 2. Create Initial Synthetic Claims
    const initialClaims: ClaimRecord[] = [
      {
        id: `claim:synthetic:${externalId}:stage`,
        job_id: jobRecord.id,
        source: "synthetic:simulation",
        source_record_ref: "reception_log",
        property: "stage",
        value: "reception",
        provenance: "SYNTHETIC",
        producer: "NOVA Simulation Engine",
        recorded_at: new Date().toISOString(),
        effective_from: null,
      },
      {
        id: `claim:synthetic:${externalId}:part_receipt`,
        job_id: jobRecord.id,
        source: "synthetic:simulation",
        source_record_ref: "parts_requisition",
        property: "part_receipt",
        value: "R-SIM",
        provenance: "SYNTHETIC",
        producer: "NOVA Simulation Engine",
        recorded_at: new Date().toISOString(),
        effective_from: null,
      },
      {
        id: `claim:synthetic:${externalId}:receipt_ref`,
        job_id: jobRecord.id,
        source: "synthetic:simulation",
        source_record_ref: "parts_requisition",
        property: "receipt_ref",
        value: "R-SIM",
        provenance: "SYNTHETIC",
        producer: "NOVA Simulation Engine",
        recorded_at: new Date().toISOString(),
        effective_from: null,
      },
    ];

    for (const claim of initialClaims) {
      await repo.appendClaim(claim);
    }

    // 3. Create initial stage event: stage:reception
    const context: ProducerContext = {
      kind: "synthetic",
      source: "synthetic:simulation",
      producer: "NOVA Simulation Engine",
    };

    const initialEvent: EventInput = {
      job: { source: "synthetic:simulation", external_id: externalId },
      external_id: `EV-SIM-RECEPTION-${externalId}`,
      event_type: "stage:reception",
      provenance: "SYNTHETIC",
      time: { kind: "timestamp", raw: new Date().toISOString() },
    };

    await ingestEvent(initialEvent, context, repo);
    activeRunId = jobRecord.id;

    const state = await getActiveSimulationState(jobRecord.id);
    if (!state) throw new Error("Failed to initialize pipeline state.");

    return { ok: true, state };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to start simulation." };
  }
}

/**
 * Authoritative Server-side Approval & Transition Service.
 * Used by BOTH Web UI and Telegram.
 */
export async function approvePipelineTransition(
  runId: string,
  approvalSource: SimulationApprovalSource,
  reviewerName = "Workshop Manager",
): Promise<TransitionResult> {
  try {
    const state = await getActiveSimulationState(runId);
    if (!state) return { ok: false, error: "Simulation run not found." };

    if (state.status === "COMPLETED") {
      return { ok: false, error: "Simulation workflow is already completed." };
    }

    if (state.incidentActive) {
      return {
        ok: false,
        error: "Pipeline is paused due to an unverified evidence gap. Confirm handoff first.",
        code: "INCIDENT_UNRESOLVED",
      };
    }

    const nextStage = state.nextStage;
    if (!nextStage) return { ok: false, error: "No valid next stage for transition." };

    const workspace = await loadOperationalWorkspace();
    const job = workspace.snapshot.jobs.find((j) => j.id === state.runId);
    if (!job) return { ok: false, error: "Job record not found in workspace." };

    // 1. Recompute current investigation plan & findings for governance verification
    const claims = workspace.snapshot.claims.filter((c) => c.job_id === job.id);
    const events = workspace.snapshot.events.filter((e) => e.job_id === job.id);
    const findings = evaluateEvidence({ claims, events });
    const plan = await investigationProvider.generate({ job, claims, events, findings });

    // 2. Record HUMAN_VALIDATED decision via official decision repository
    const client = createSupabaseAdminClient();
    const decisionRepo = new SupabaseDecisionRepository(client);

    const decisionInput = {
      jobId: job.id,
      investigationPlanId: plan.id,
      decisionType: "APPROVED" as const,
      selectedNextStep: plan.suggestedNextAction.text,
      correctionText: `Approved via ${approvalSource}`,
    };

    const decision = await recordHumanDecision(decisionInput, workspace.snapshot, decisionRepo);

    // 3. Ingest next stage SYNTHETIC event via official M07 ingestion boundary
    const repo = new SupabaseOperationalRepository(client);
    const context: ProducerContext = {
      kind: "synthetic",
      source: "synthetic:simulation",
      producer: `NOVA Pipeline Service (${approvalSource})`,
    };

    const stageEventType = `stage:${nextStage.toLowerCase()}`;
    const nextEventInput: EventInput = {
      job: { source: job.source, external_id: job.external_id },
      external_id: `EV-SIM-${nextStage}-${job.external_id}-${Date.now()}`,
      event_type: stageEventType,
      provenance: "SYNTHETIC",
      time: { kind: "timestamp", raw: new Date().toISOString() },
    };

    const event = await ingestEvent(nextEventInput, context, repo);

    // If reaching PARTS_APPROVAL, inject the initial part event without handoff to trigger incident!
    if (nextStage === "PARTS_APPROVAL") {
      const partReqInput: EventInput = {
        job: { source: job.source, external_id: job.external_id },
        external_id: `EV-SIM-PART-REQ-${job.external_id}`,
        event_type: "part ordered",
        provenance: "SYNTHETIC",
        time: { kind: "timestamp", raw: new Date().toISOString() },
      };
      await ingestEvent(partReqInput, context, repo);

      // Best effort Telegram Incident Alert
      try {
        const { sendTelegramCustomMessage } = await import("@/server/alerts/telegram");
        await sendTelegramCustomMessage(
          `⚠️ <b>NOVA — Attention Required</b>\n\n🚗 <b>${job.external_id}</b>\nStage: <b>Parts / Approval</b>\n\nA part order event was recorded, but part-to-job handoff evidence is missing.\n\n<b>NOVA recommends:</b> Verify the part-to-job handoff.`
        );
      } catch {
        // Best effort notification
      }
    } else {
      // Send Telegram gate notification for next stage if not collection
      try {
        const futureNext = getNextStage(nextStage);
        if (futureNext) {
          const { sendTelegramCustomMessage } = await import("@/server/alerts/telegram");
          await sendTelegramCustomMessage(
            `🔔 <b>NOVA — Workshop Pipeline</b>\n\n🚗 <b>${job.external_id}</b>\n\nCurrent step:\n<b>${nextStage.replace("_", " ")}</b>\n\nNOVA is ready to continue to:\n<b>${futureNext.replace("_", " ")}</b>\n\nHuman approval required.\nReply <b>approve</b> to continue.`
          );
        } else {
          const { sendTelegramCustomMessage } = await import("@/server/alerts/telegram");
          await sendTelegramCustomMessage(
            `🎉 <b>NOVA — Workshop Pipeline Complete</b>\n\n🚗 <b>${job.external_id}</b>\n\nWorkflow completed successfully across all stages!`
          );
        }
      } catch {
        // Best effort delivery
      }
    }

    const newState = await getActiveSimulationState(runId);
    return { ok: true, state: newState || state, decision, event };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Transition approval failed." };
  }
}

/**
 * Incident resolution demo action: Confirms part handoff.
 */
export async function confirmSimulationHandoff(runId: string): Promise<TransitionResult> {
  try {
    const state = await getActiveSimulationState(runId);
    if (!state) return { ok: false, error: "Simulation run not found." };

    const client = createSupabaseAdminClient();
    const repo = new SupabaseOperationalRepository(client);
    const context: ProducerContext = {
      kind: "synthetic",
      source: "synthetic:simulation",
      producer: "NOVA Incident Resolver",
    };

    const handoffEvent: EventInput = {
      job: { source: "synthetic:simulation", external_id: state.externalJobId },
      external_id: `SYN-HANDOFF-${state.externalJobId}-${Date.now()}`,
      event_type: "part handoff confirmed",
      provenance: "SYNTHETIC",
      time: { kind: "timestamp", raw: new Date().toISOString() },
    };

    const event = await ingestEvent(handoffEvent, context, repo);

    // Send Telegram update
    try {
      const { sendTelegramCustomMessage } = await import("@/server/alerts/telegram");
      await sendTelegramCustomMessage(
        `✅ <b>NOVA Update</b>\n\n🚗 <b>${state.externalJobId}</b>\nHandoff evidence confirmed. Pipeline is ready for human approval.\n\nReply <b>approve</b> to continue to Repair.`
      );
    } catch {
      // Best effort
    }

    const updatedState = await getActiveSimulationState(runId);
    return { ok: true, state: updatedState || state, event };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to confirm handoff." };
  }
}

