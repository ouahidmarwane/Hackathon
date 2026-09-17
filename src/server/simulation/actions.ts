"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  startSimulationRun,
  approvePipelineTransition,
  confirmSimulationHandoff,
  getActiveSimulationState,
  type TransitionResult,
  type StartResult,
} from "@/server/simulation/service";
import { SupabaseSimulationRepository } from "@/server/simulation/repository";
import { pollTelegramInboundUpdates } from "@/server/alerts/telegram-inbound";
import type { PipelineState } from "@/domain/pipeline-simulation";

function repository() {
  return new SupabaseSimulationRepository(createSupabaseAdminClient());
}

function refreshPage() {
  try {
    revalidatePath("/");
  } catch {
    // Ignore when invoked outside a Next request lifecycle.
  }
}

export async function startSimulationAction(): Promise<StartResult> {
  const result = await startSimulationRun(repository());
  if (result.ok) refreshPage();
  return result;
}

export async function approvePipelineWebAction(
  runId: string,
): Promise<TransitionResult> {
  const result = await approvePipelineTransition(repository(), runId, "WEB", "Workshop Manager");
  if (result.ok) refreshPage();
  return result;
}

export async function confirmHandoffAction(
  runId: string,
): Promise<TransitionResult> {
  const result = await confirmSimulationHandoff(repository(), runId);
  if (result.ok) refreshPage();
  return result;
}

export async function fetchSimulationStateAction(
  runId?: string,
): Promise<PipelineState | null> {
  return getActiveSimulationState(repository(), runId);
}

/** Browser-driven Telegram inbound polling (local demo long-poll substitute).
 * Returns whether any authorized approval command was processed. */
export async function pollTelegramInboundAction(): Promise<{ processed: number; approved: boolean }> {
  return pollTelegramInboundUpdates();
}

