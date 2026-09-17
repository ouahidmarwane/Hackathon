"use server";

import { loadOperationalSnapshot } from "@/server/control-tower/loader";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { HumanDecision } from "@/domain/human-decision";
import { recordHumanDecision } from "./service";
import { SupabaseDecisionRepository } from "./supabase-repository";

export type DecisionActionResult =
  | { ok: true; decision: HumanDecision }
  | { ok: false; error: string };

/** Server-owned write path. The browser supplies only the reviewed plan
 * identity and human content; provenance, reviewer, source references and
 * timestamps are recomputed or set on the server. Errors are sanitized. */
export async function submitHumanDecision(
  input: unknown,
): Promise<DecisionActionResult> {
  try {
    const snapshot = await loadOperationalSnapshot();
    const repository = new SupabaseDecisionRepository(createSupabaseAdminClient());
    const decision = await recordHumanDecision(input, snapshot, repository);
    return { ok: true, decision };
  } catch {
    return { ok: false, error: "The decision could not be recorded." };
  }
}
