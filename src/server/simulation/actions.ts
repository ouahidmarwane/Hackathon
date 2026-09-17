"use server";

import { revalidatePath } from "next/cache";
import {
  startSimulationRun,
  approvePipelineTransition,
  confirmSimulationHandoff,
  getActiveSimulationState,
  type TransitionResult,
} from "@/server/simulation/service";
import type { PipelineState } from "@/domain/pipeline-simulation";

export async function startSimulationAction(): Promise<
  { ok: true; state: PipelineState } | { ok: false; error: string }
> {
  const result = await startSimulationRun();
  if (result.ok) {
    try {
      revalidatePath("/");
    } catch {
      // Ignore if outside request context
    }
  }
  return result;
}

export async function approvePipelineWebAction(
  runId: string,
): Promise<TransitionResult> {
  const result = await approvePipelineTransition(runId, "WEB", "Workshop Manager");
  if (result.ok) {
    try {
      revalidatePath("/");
    } catch {
      // Ignore if outside request context
    }
  }
  return result;
}

export async function confirmHandoffAction(
  runId: string,
): Promise<TransitionResult> {
  const result = await confirmSimulationHandoff(runId);
  if (result.ok) {
    try {
      revalidatePath("/");
    } catch {
      // Ignore if outside request context
    }
  }
  return result;
}

export async function fetchSimulationStateAction(
  runId?: string,
): Promise<PipelineState | null> {
  return getActiveSimulationState(runId);
}

