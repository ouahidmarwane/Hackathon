import "server-only";
import { createHash } from "node:crypto";

/** Deterministic UUIDv8 for simulation persistence records. Mirrors the layout
 * in src/server/ingestion/identity.ts. Never depends on wall-clock time. */
export function simulationIdentity(
  kind: "run" | "claim" | "event" | "approval",
  ...parts: string[]
): string {
  const bytes = createHash("sha256")
    .update(JSON.stringify(["simulation-v1", kind, ...parts]))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
