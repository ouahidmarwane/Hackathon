export type ResolutionCategory =
  | "PARTS_HANDOFF"
  | "APPROVAL_DISPATCH"
  | "QUALITY_CHECK"
  | "READINESS"
  | "STAGE_VERIFICATION"
  | "GENERAL";

export const RESOLUTION_CATEGORIES: readonly ResolutionCategory[] = [
  "PARTS_HANDOFF",
  "APPROVAL_DISPATCH",
  "QUALITY_CHECK",
  "READINESS",
  "STAGE_VERIFICATION",
  "GENERAL",
] as const;

export type ResolutionMemory = {
  id: string;
  jobId: string;
  externalJobId: string;
  decisionId: string | null;
  stage: string;
  missingEvidenceCodes: string[];
  ruleCode: string | null;
  category: ResolutionCategory;
  lesson: string;
  sourceRefs: string[];
  validatedBy: string;
  provenance: "HUMAN_VALIDATED";
  createdAt: string;
};

export type MemoryRecallMatch = {
  memory: ResolutionMemory;
  relevanceReason: string;
  matchedFactors: string[];
};

function checkText(value: unknown, min: number, max: number, field: string): string {
  if (
    typeof value !== "string" ||
    value.length < min ||
    value.length > max ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`Invalid ${field}: must be trimmed text between ${min} and ${max} chars.`);
  }
  return value;
}

export function parseResolutionMemoryRecord(row: unknown): ResolutionMemory {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("Resolution memory record must be an object.");
  }
  const data = row as Record<string, unknown>;

  const id = checkText(data.id, 1, 100, "id");
  const jobId = checkText(data.jobId, 1, 100, "jobId");
  const externalJobId = checkText(data.externalJobId, 1, 200, "externalJobId");
  const stage = checkText(data.stage, 1, 100, "stage");
  const lesson = checkText(data.lesson, 5, 1000, "lesson");
  const validatedBy = checkText(data.validatedBy, 1, 200, "validatedBy");

  if (data.provenance !== "HUMAN_VALIDATED") {
    throw new Error("Resolution memory provenance must be HUMAN_VALIDATED.");
  }

  const category = String(data.category) as ResolutionCategory;
  if (!RESOLUTION_CATEGORIES.includes(category)) {
    throw new Error(`Invalid resolution category: ${data.category}`);
  }

  const decisionId = data.decisionId === null || data.decisionId === undefined
    ? null
    : checkText(data.decisionId, 1, 100, "decisionId");

  const ruleCode = data.ruleCode === null || data.ruleCode === undefined
    ? null
    : checkText(data.ruleCode, 1, 100, "ruleCode");

  if (!Array.isArray(data.missingEvidenceCodes)) {
    throw new Error("missingEvidenceCodes must be an array.");
  }
  const missingEvidenceCodes = data.missingEvidenceCodes.map(code =>
    checkText(code, 1, 100, "missingEvidenceCode"),
  );

  if (!Array.isArray(data.sourceRefs)) {
    throw new Error("sourceRefs must be an array.");
  }
  const sourceRefs = data.sourceRefs.map(ref => checkText(ref, 1, 1000, "sourceRef"));

  const createdAt = checkText(data.createdAt, 1, 100, "createdAt");
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new Error("createdAt must be a valid ISO timestamp.");
  }

  return {
    id,
    jobId,
    externalJobId,
    decisionId,
    stage,
    missingEvidenceCodes,
    ruleCode,
    category,
    lesson,
    sourceRefs,
    validatedBy,
    provenance: "HUMAN_VALIDATED",
    createdAt,
  };
}

/**
 * Deterministic structured memory recall without black-box embeddings or scores.
 * 
 * Strict invariants:
 * 1. Memory informs the human; it never mutates evidence classifications or workshop status.
 * 2. Matches are based on explicit shared operational patterns (stage, gaps, rules).
 * 3. Every recall explains "Why this memory was retrieved".
 */
export function recallRelevantMemories(
  currentCase: {
    jobId: string;
    stage?: string;
    missingCodes: string[];
    ruleCodes?: string[];
  },
  memories: readonly ResolutionMemory[],
): MemoryRecallMatch[] {
  const matches: MemoryRecallMatch[] = [];

  for (const memory of memories) {
    if (currentCase.jobId && memory.jobId === currentCase.jobId) {
      continue;
    }

    const matchedFactors: string[] = [];
    const reasons: string[] = [];

    const missingCodes = currentCase.missingCodes ?? [];
    // Factor 1: Matching specific evidence gap requirements
    const sharedGaps = missingCodes.filter(code =>
      memory.missingEvidenceCodes.includes(code),
    );

    if (sharedGaps.includes("PART_TO_JOB_HANDOFF_CONFIRMATION")) {
      matchedFactors.push("PART_TO_JOB_HANDOFF_CONFIRMATION");
      reasons.push("Both cases involve parts scan evidence without confirmed part-to-job handoff.");
    }

    if (sharedGaps.includes("APPROVAL_REQUEST_DISPATCH_CONFIRMATION")) {
      matchedFactors.push("APPROVAL_REQUEST_DISPATCH_CONFIRMATION");
      reasons.push("Both cases involve prepared approval requests without confirmed customer dispatch.");
    }

    if (sharedGaps.includes("QUALITY_CHECK_PROGRESS_CONFIRMATION") || sharedGaps.includes("DEVICE_STATE_CONFIRMATION")) {
      matchedFactors.push("QUALITY_CHECK_EVIDENCE");
      reasons.push("Both cases involve unconfirmed quality check observations or device telemetry.");
    }

    if (sharedGaps.includes("OPERATIONAL_READINESS_CONFIRMATION")) {
      matchedFactors.push("OPERATIONAL_READINESS_CONFIRMATION");
      reasons.push("Both cases involve recorded Ready status without independent readiness verification.");
    }

    // Factor 2: Matching stage verification
    if (
      currentCase.stage &&
      memory.stage.toLowerCase() === currentCase.stage.toLowerCase() &&
      sharedGaps.includes("STAGE_CONFIRMATION")
    ) {
      matchedFactors.push(`STAGE:${currentCase.stage}`);
      reasons.push(`Both cases involve verifying current operational stage in '${currentCase.stage}'.`);
    }

    // Factor 3: Category match when gaps overlap
    if (matchedFactors.length > 0) {
      matches.push({
        memory,
        relevanceReason: reasons.join(" "),
        matchedFactors,
      });
    }
  }

  // Sort deterministically: most matched factors first, then newest creation timestamp
  return matches.sort((a, b) =>
    b.matchedFactors.length - a.matchedFactors.length ||
    b.memory.createdAt.localeCompare(a.memory.createdAt),
  );
}
