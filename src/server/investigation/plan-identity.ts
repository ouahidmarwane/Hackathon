import { createHash } from "node:crypto";

/** Stable, deterministic identity for a generated investigation plan.
 * Derived from the job identity, provider, provider version and the sorted
 * source references. Never from wall-clock time, rendering order or input
 * ordering. Mirrors the UUIDv8 layout in `src/server/ingestion/identity.ts`.
 */
export function investigationPlanIdentity(input: {
  jobId: string;
  producer: string;
  version: string;
  sourceClaimIds: readonly string[];
  sourceEventIds: readonly string[];
  sourceFindingIds: readonly string[];
}): string {
  const tuple = [
    "investigation-plan-v1",
    input.jobId,
    input.producer,
    input.version,
    [...input.sourceClaimIds].sort(),
    [...input.sourceEventIds].sort(),
    [...input.sourceFindingIds].sort(),
  ];
  const bytes = createHash("sha256")
    .update(JSON.stringify(tuple))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
