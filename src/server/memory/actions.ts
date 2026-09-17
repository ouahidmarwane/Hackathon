"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SupabaseMemoryRepository } from "./supabase-repository";
import type { ResolutionCategory, ResolutionMemory } from "@/domain/resolution-memory";

export type MemoryActionResult =
  | { ok: true; memory: ResolutionMemory }
  | { ok: false; error: string };

export type CaptureMemoryInput = {
  jobId: string;
  externalJobId: string;
  decisionId?: string | null;
  stage: string;
  missingEvidenceCodes?: string[];
  ruleCode?: string | null;
  category: ResolutionCategory;
  lesson: string;
  sourceRefs?: string[];
  validatedBy: string;
};

/**
 * Server-owned memory capture boundary.
 * Strict human validation required; provenance is strictly set to HUMAN_VALIDATED on the server.
 */
export async function captureResolutionMemory(
  input: unknown,
): Promise<MemoryActionResult> {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { ok: false, error: "Invalid memory payload." };
    }
    const data = input as Partial<CaptureMemoryInput>;

    if (!data.jobId || typeof data.jobId !== "string") {
      return { ok: false, error: "Missing jobId." };
    }
    if (!data.externalJobId || typeof data.externalJobId !== "string") {
      return { ok: false, error: "Missing externalJobId." };
    }
    if (!data.stage || typeof data.stage !== "string") {
      return { ok: false, error: "Missing stage." };
    }
    if (!data.lesson || typeof data.lesson !== "string" || data.lesson.trim().length < 5) {
      return { ok: false, error: "Lesson must be at least 5 characters." };
    }
    if (!data.validatedBy || typeof data.validatedBy !== "string" || !data.validatedBy.trim()) {
      return { ok: false, error: "Validator name is required." };
    }

    const category: ResolutionCategory = [
      "PARTS_HANDOFF", "APPROVAL_DISPATCH", "QUALITY_CHECK", "READINESS", "STAGE_VERIFICATION", "GENERAL",
    ].includes(data.category as ResolutionCategory) ? (data.category as ResolutionCategory) : "GENERAL";

    const memoryDraft = {
      id: randomUUID(),
      jobId: data.jobId.trim(),
      externalJobId: data.externalJobId.trim(),
      decisionId: data.decisionId?.trim() ?? null,
      stage: data.stage.trim(),
      missingEvidenceCodes: Array.isArray(data.missingEvidenceCodes) ? data.missingEvidenceCodes : [],
      ruleCode: data.ruleCode?.trim() ?? null,
      category,
      lesson: data.lesson.trim(),
      sourceRefs: Array.isArray(data.sourceRefs) ? data.sourceRefs : [],
      validatedBy: data.validatedBy.trim(),
      provenance: "HUMAN_VALIDATED" as const,
    };

    const client = createSupabaseAdminClient();
    const repository = new SupabaseMemoryRepository(client);
    const memory = await repository.appendMemory(memoryDraft);

    revalidatePath("/");
    return { ok: true, memory };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The resolution memory could not be recorded.",
    };
  }
}

