import "server-only";

import { evaluateEvidence } from "@/domain/evidence-engine";
import { createDeterministicPlan } from "@/server/investigation/provider";
import type { ClaimRecord, EventRecord, JobRecord } from "@/domain/operational-model";
import type { InvestigationPlan } from "@/domain/investigation";
import {
  INCIDENT_STAGE,
  PIPELINE_STAGES,
  SIMULATION_PRODUCER,
  SIMULATION_SOURCE,
  getNextStage,
  stageLabel,
  type ApprovalChannel,
  type PipelineStage,
  type PipelineState,
  type SimulationApprovalRecord,
  type SimulationClaimRecord,
  type SimulationEventRecord,
  type SimulationRunRecord,
} from "@/domain/pipeline-simulation";
import { simulationIdentity } from "./identity";
import type { SimulationRepository } from "./repository";

export type TransitionResult =
  | { ok: true; state: PipelineState; approval: SimulationApprovalRecord }
  | { ok: false; error: string; code?: string };

export type StartResult =
  | { ok: true; state: PipelineState }
  | { ok: false; error: string };

/** Demo approval policy: every stage transition requires a human approval.
 * This is intentionally not a claim about how real workshops operate. */
const STAGE_MESSAGES: Record<PipelineStage, { message: string }> = {
  RECEPTION: { message: "Vehicle received." },
  DIAGNOSIS: { message: "Diagnosis is ready." },
  PARTS_APPROVAL: { message: "Parts and approval are being checked." },
  REPAIR: { message: "Repair is ready." },
  QUALITY_CHECK: { message: "Quality check is ready." },
  READY: { message: "Vehicle is ready." },
  COLLECTION: { message: "Vehicle workflow completed." },
};

function toDomainJob(run: SimulationRunRecord): JobRecord {
  return {
    id: run.id,
    source: SIMULATION_SOURCE,
    external_id: run.external_id,
    provenance: "SYNTHETIC",
    producer: SIMULATION_PRODUCER,
  };
}

function toDomainClaim(run: SimulationRunRecord, claim: SimulationClaimRecord): ClaimRecord {
  return {
    id: claim.id,
    job_id: run.id,
    source: SIMULATION_SOURCE,
    source_record_ref: run.external_id,
    property: claim.property,
    value: claim.value,
    provenance: "SYNTHETIC",
    producer: SIMULATION_PRODUCER,
    recorded_at: null,
    effective_from: null,
  };
}

function toDomainEvent(run: SimulationRunRecord, event: SimulationEventRecord): EventRecord {
  return {
    id: event.id,
    job_id: run.id,
    source: SIMULATION_SOURCE,
    external_id: event.external_id,
    event_type: event.event_type,
    provenance: "SYNTHETIC",
    producer: SIMULATION_PRODUCER,
    time_kind: "unknown",
    occurred_at_raw: null,
    occurred_at: null,
  };
}

/** Real M03 + M05 evaluation of the simulation's SYNTHETIC evidence. Used only
 * at the incident stage; it never sets classifications directly. */
function evaluateGate(
  run: SimulationRunRecord,
  claims: SimulationClaimRecord[],
  events: SimulationEventRecord[],
): { plan: InvestigationPlan; handoffPresent: boolean; handoffGap: boolean } {
  const domainClaims = claims.map((claim) => toDomainClaim(run, claim));
  const domainEvents = events.map((event) => toDomainEvent(run, event));
  const findings = evaluateEvidence({ claims: domainClaims, events: domainEvents });
  const plan = createDeterministicPlan({
    job: toDomainJob(run),
    claims: domainClaims,
    events: domainEvents,
    findings,
  });
  const handoffPresent = events.some((event) => event.event_type === "part handoff confirmed");
  const handoffGap = findings.some((finding) =>
    finding.missing_evidence.includes("PART_TO_JOB_HANDOFF_CONFIRMATION"),
  );
  return { plan, handoffPresent, handoffGap };
}

function novaCopy(
  run: SimulationRunRecord,
  gate: { plan: InvestigationPlan; handoffPresent: boolean; handoffGap: boolean } | null,
): { novaMessage: string; suggestedNextStep: string } {
  if (run.current_stage === INCIDENT_STAGE && gate) {
    if (gate.handoffGap && !gate.handoffPresent) {
      return {
        novaMessage:
          "I need one more piece of evidence. A part event was recorded, but I can't verify that the part reached the job / technician.",
        suggestedNextStep: gate.plan.suggestedNextAction.text,
      };
    }
    return {
      novaMessage: "Handoff confirmed. Parts and approval are ready.",
      suggestedNextStep: "Approve to continue to Repair.",
    };
  }
  if (run.run_status === "COMPLETED") {
    return { novaMessage: "Vehicle workflow completed.", suggestedNextStep: "Workflow complete." };
  }
  const next = getNextStage(run.current_stage);
  return {
    novaMessage: STAGE_MESSAGES[run.current_stage].message,
    suggestedNextStep: next
      ? `Approve to continue to ${stageLabel(next)}.`
      : "Approve to complete the workflow.",
  };
}

export async function buildPipelineState(
  repo: SimulationRepository,
  run: SimulationRunRecord,
): Promise<PipelineState> {
  const [claims, events, approvals] = await Promise.all([
    repo.listClaims(run.id),
    repo.listEvents(run.id),
    repo.listApprovals(run.id),
  ]);
  const gate = run.current_stage === INCIDENT_STAGE ? evaluateGate(run, claims, events) : null;
  const copy = novaCopy(run, gate);
  return {
    runId: run.id,
    externalId: run.external_id,
    currentStage: run.current_stage,
    nextStage: getNextStage(run.current_stage),
    stageStatus: run.stage_status,
    runStatus: run.run_status,
    incidentActive: run.incident_active,
    novaMessage: copy.novaMessage,
    suggestedNextStep: copy.suggestedNextStep,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    approvals: approvals.map((approval) => ({
      fromStage: approval.from_stage,
      toStage: approval.to_stage,
      channel: approval.channel,
      createdAt: approval.created_at,
    })),
    events: events.map((event) => ({
      eventType: event.event_type,
      provenance: event.provenance,
      createdAt: event.created_at,
    })),
  };
}

export async function getActiveSimulationState(
  repo: SimulationRepository,
  targetRunId?: string,
): Promise<PipelineState | null> {
  const run = targetRunId ? await repo.getRun(targetRunId) : await repo.getActiveRun();
  if (!run) return null;
  return buildPipelineState(repo, run);
}

/** Creates a new append-safe SYNTHETIC simulation run. Never touches W-1–W-4. */
export async function startSimulationRun(repo: SimulationRepository): Promise<StartResult> {
  try {
    const runNumber = await repo.nextRunNumber();
    const externalId = `SIM-${String(runNumber).padStart(3, "0")}`;
    const runId = simulationIdentity("run", externalId);
    const now = new Date().toISOString();
    const run: SimulationRunRecord = {
      id: runId,
      external_id: externalId,
      run_number: runNumber,
      current_stage: "RECEPTION",
      stage_status: "WAITING_FOR_APPROVAL",
      run_status: "RUNNING",
      incident_active: false,
      created_at: now,
      updated_at: now,
    };
    const claims: SimulationClaimRecord[] = [
      { id: simulationIdentity("claim", runId, "stage"), run_id: runId, property: "stage", value: "awaiting parts", provenance: "SYNTHETIC", created_at: now },
      { id: simulationIdentity("claim", runId, "part_receipt"), run_id: runId, property: "part_receipt", value: "received", provenance: "SYNTHETIC", created_at: now },
      { id: simulationIdentity("claim", runId, "receipt_ref"), run_id: runId, property: "receipt_ref", value: `R-${externalId}`, provenance: "SYNTHETIC", created_at: now },
      { id: simulationIdentity("claim", runId, "next_owner"), run_id: runId, property: "next_owner", value: "parts coordinator", provenance: "SYNTHETIC", created_at: now },
    ];
    await repo.createRun(run, claims);
    const state = await getActiveSimulationState(repo, runId);
    if (!state) return { ok: false, error: "Failed to initialize simulation state." };
    return { ok: true, state };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to start simulation." };
  }
}

function receiptRef(run: SimulationRunRecord): string {
  return `R-${run.external_id}`;
}

/** Authoritative approval + transition service. Web and Telegram both call
 * exactly this function; the channel is recorded but never selects a stage. */
export async function approvePipelineTransition(
  repo: SimulationRepository,
  runId: string,
  channel: ApprovalChannel,
  reviewer: string,
): Promise<TransitionResult> {
  try {
    const run = await repo.getRun(runId);
    if (!run) return { ok: false, error: "Simulation run not found.", code: "NOT_FOUND" };
    if (run.run_status === "COMPLETED") {
      return { ok: false, error: "Workflow is already completed.", code: "COMPLETED" };
    }

    const from = run.current_stage;
    const next = getNextStage(from);

    // Incident gate: server-enforced, not merely a disabled button.
    if (from === INCIDENT_STAGE) {
      const [claims, events] = await Promise.all([repo.listClaims(run.id), repo.listEvents(run.id)]);
      const gate = evaluateGate(run, claims, events);
      if (gate.handoffGap && !gate.handoffPresent) {
        return {
          ok: false,
          error: "Part-to-job handoff is not confirmed. Confirm handoff before approving.",
          code: "INCIDENT_UNRESOLVED",
        };
      }
    }

    if (run.stage_status !== "WAITING_FOR_APPROVAL") {
      return {
        ok: false,
        error: "NOVA cannot continue yet. Required evidence is still missing.",
        code: "NOT_READY",
      };
    }

    // Advance or complete with a conditional, race-safe update.
    let updated: SimulationRunRecord | null;
    if (next) {
      updated = await repo.advanceStage(run.id, from, next, "WAITING_FOR_APPROVAL", "RUNNING", false);
    } else {
      updated = await repo.completeRun(run.id, from);
    }

    if (!updated) {
      const current = await getActiveSimulationState(repo, run.id);
      if (!current) return { ok: false, error: "Simulation run not found.", code: "NOT_FOUND" };
      return { ok: false, error: "This step was already approved.", code: "DUPLICATE" };
    }

    // Record the HUMAN_VALIDATED approval (channel = WEB or TELEGRAM, not provenance).
    const toStage = next ?? "COMPLETED";
    const approval: SimulationApprovalRecord = {
      id: simulationIdentity("approval", run.id, from, toStage),
      run_id: run.id,
      from_stage: from,
      to_stage: toStage,
      reviewer,
      channel,
      provenance: "HUMAN_VALIDATED",
      created_at: new Date().toISOString(),
    };
    await repo.appendApproval(approval);

    // Introduce the incident exactly when the run reaches Parts / Approval.
    if (next === INCIDENT_STAGE) {
      await repo.appendEvent({
        id: simulationIdentity("event", run.id, `part-scan-${receiptRef(run)}`),
        run_id: run.id,
        external_id: receiptRef(run),
        event_type: "part scan",
        provenance: "SYNTHETIC",
        created_at: new Date().toISOString(),
      });
      await refreshIncidentGate(repo, run.id);
      void notifyIncident(run.external_id);
    } else if (next) {
      void notifyGate(run.external_id, next);
    } else {
      void notifyComplete(run.external_id);
    }

    const state = await getActiveSimulationState(repo, run.id);
    if (!state) return { ok: false, error: "Failed to refresh simulation state." };
    return { ok: true, state, approval };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Transition approval failed." };
  }
}

/** Confirms the handoff by ingesting a SYNTHETIC event, then re-evaluates. */
export async function confirmSimulationHandoff(
  repo: SimulationRepository,
  runId: string,
): Promise<TransitionResult> {
  try {
    const run = await repo.getRun(runId);
    if (!run) return { ok: false, error: "Simulation run not found.", code: "NOT_FOUND" };
    if (run.current_stage !== INCIDENT_STAGE) {
      return { ok: false, error: "No handoff confirmation is needed at this stage.", code: "NOT_READY" };
    }
    const now = new Date().toISOString();
    await repo.appendEvent({
      id: simulationIdentity("event", run.id, "handoff-confirmed"),
      run_id: run.id,
      external_id: `SYN-HANDOFF-${run.external_id}`,
      event_type: "part handoff confirmed",
      provenance: "SYNTHETIC",
      created_at: now,
    });
    await refreshIncidentGate(repo, run.id);
    void notifyReady(run.external_id);
    const state = await getActiveSimulationState(repo, run.id);
    if (!state) return { ok: false, error: "Failed to refresh simulation state." };
    return {
      ok: true,
      state,
      approval: {
        id: simulationIdentity("approval", run.id, run.current_stage, run.current_stage),
        run_id: run.id,
        from_stage: run.current_stage,
        to_stage: run.current_stage,
        reviewer: "NOVA Incident Resolver",
        channel: "WEB",
        provenance: "HUMAN_VALIDATED",
        created_at: now,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to confirm handoff." };
  }
}

async function refreshIncidentGate(repo: SimulationRepository, runId: string): Promise<void> {
  const run = await repo.getRun(runId);
  if (!run) return;
  const [claims, events] = await Promise.all([repo.listClaims(runId), repo.listEvents(runId)]);
  const gate = evaluateGate(run, claims, events);
  const blocked = gate.handoffGap && !gate.handoffPresent;
  await repo.updateRunStatus(
    runId,
    blocked ? "WAITING_FOR_EVIDENCE" : "WAITING_FOR_APPROVAL",
    blocked ? "BLOCKED" : "RUNNING",
    blocked,
  );
}

// Best-effort Telegram side effects. Failure never breaks the workflow.
async function notifyIncident(externalId: string): Promise<void> {
  try {
    const { sendTelegramCustomMessage } = await import("@/server/alerts/telegram");
    await sendTelegramCustomMessage(
      `⚠️ <b>NOVA — Attention Required</b>\n\n🚗 <b>${externalId}</b>\nParts / Approval\n\nA part event was recorded, but part-to-job handoff confirmation is missing.\n\nNOVA recommends: Verify the part-to-job handoff.`,
    );
  } catch { /* best effort */ }
}

async function notifyReady(externalId: string): Promise<void> {
  try {
    const { sendTelegramCustomMessage } = await import("@/server/alerts/telegram");
    await sendTelegramCustomMessage(
      `✅ <b>NOVA Update</b>\n\n🚗 <b>${externalId}</b>\nHandoff confirmed. Ready for human approval.\n\nReply <b>approve</b> to continue to Repair.`,
    );
  } catch { /* best effort */ }
}

async function notifyGate(externalId: string, next: PipelineStage): Promise<void> {
  try {
    const { sendTelegramCustomMessage } = await import("@/server/alerts/telegram");
    const nextLabel = stageLabel(next);
    const after = getNextStage(next);
    await sendTelegramCustomMessage(
      `🔔 <b>NOVA — Workshop Pipeline</b>\n\n🚗 <b>${externalId}</b>\n\nCurrent step:\n<b>${nextLabel}</b>\n\nNext:\n<b>${after ? stageLabel(after) : "Complete"}</b>\n\nStatus: Waiting for your approval.\n\nReply <b>approve</b> to continue.`,
    );
  } catch { /* best effort */ }
}

async function notifyComplete(externalId: string): Promise<void> {
  try {
    const { sendTelegramCustomMessage } = await import("@/server/alerts/telegram");
    await sendTelegramCustomMessage(
      `🎉 <b>NOVA — Workshop Pipeline Complete</b>\n\n🚗 <b>${externalId}</b>\n\nWorkflow completed across all stages.`,
    );
  } catch { /* best effort */ }
}

export const SIMULATION_STAGES: readonly PipelineStage[] = PIPELINE_STAGES;
