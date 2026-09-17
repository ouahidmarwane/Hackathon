import "server-only";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { textValue, validateSourceRef, type JobRecord, type ClaimRecord, type EventRecord } from "@/domain/operational-model";
import { evaluateEvidence } from "@/domain/evidence-engine";
import { parseHumanDecisionRecord, type HumanDecision } from "@/domain/human-decision";
import { parseResolutionMemoryRecord, type ResolutionMemory } from "@/domain/resolution-memory";

const execute = promisify(execFile);
export class WorkshopReadError extends Error {
  constructor(public readonly code: "ACCESS_CONFIGURATION" | "LOAD_FAILED" | "INVALID_RECORDS") {
    super(code); this.name = "WorkshopReadError";
  }
}
export type OperationalSnapshot = { jobs: JobRecord[]; claims: ClaimRecord[]; events: EventRecord[] };
export type OperationalWorkspace = { snapshot: OperationalSnapshot; decisions: HumanDecision[]; memories: ResolutionMemory[] };
export type SnapshotReader = () => Promise<unknown>;

/** Local prototype only. Reuses official CLI authentication without reading its
 * token/cache. Never invoke this reader from a publicly exposed dev server.
 * Production fails closed until an authenticated read architecture is reviewed.
 */
export async function readLinkedSnapshot(): Promise<unknown> {
  if (process.env.NODE_ENV !== "development") throw new WorkshopReadError("ACCESS_CONFIGURATION");
  const root = process.cwd();
  try {
    const configured = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const ref = (await readFile(resolve(root, "supabase/.temp/project-ref"), "utf8")).trim();
    if (!/^[a-z0-9]{20}$/.test(ref) || configured.protocol !== "https:" || configured.hostname !== `${ref}.supabase.co`) {
      throw new WorkshopReadError("ACCESS_CONFIGURATION");
    }
    const { stdout } = await execute(process.execPath, [
      resolve(root, "node_modules/supabase/dist/supabase.js"), "db", "query", "--linked",
      "--file", resolve(root, "supabase/queries/control-tower.sql"), "--output-format", "json", "--log-level", "none",
    ], { cwd: root, timeout: 20_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" } });
    const response: unknown = JSON.parse(stdout);
    if (!response || typeof response !== "object" || !("rows" in response) ||
      !Array.isArray(response.rows) || response.rows.length !== 1) throw new Error();
    return (response.rows[0] as { snapshot: unknown }).snapshot;
  } catch (error) {
    if (error instanceof WorkshopReadError) throw error;
    // Child process errors contain stdout, stderr and arguments; never propagate.
    throw new WorkshopReadError("LOAD_FAILED");
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
  return value as Record<string, unknown>;
}
const source = (row: Record<string, unknown>) => {
  if (!["SUPPLIED", "SYNTHETIC", "INTEGRATION"].includes(String(row.provenance))) throw new Error();
  textValue(row.producer);
  validateSourceRef({ source: row.source, external_id: row.id });
};
const optionalTime = (value: unknown) => {
  if (value !== null && (typeof value !== "string" || !Number.isFinite(Date.parse(value)))) throw new Error();
  return value as string | null;
};

/** Explicit projection removes persistence fields and rejects incomplete rows.
 * The query is a single consistent snapshot, not three independently timed reads.
 */
export function normalizeSnapshot(value: unknown): OperationalSnapshot {
  try {
    const data = object(value);
    if (!Array.isArray(data.jobs) || !Array.isArray(data.claims) || !Array.isArray(data.events)) throw new Error();
    const jobs = data.jobs.map(value => {
      const row = object(value); source(row);
      return { id: textValue(row.id), ...validateSourceRef({ source: row.source, external_id: row.external_id }),
        provenance: row.provenance as JobRecord["provenance"], producer: textValue(row.producer) };
    });
    const claims = data.claims.map(value => {
      const row = object(value); source(row);
      return { id: textValue(row.id), job_id: textValue(row.job_id), source: textValue(row.source),
        source_record_ref: textValue(row.source_record_ref), property: textValue(row.property), value: textValue(row.value),
        provenance: row.provenance as ClaimRecord["provenance"], producer: textValue(row.producer),
        recorded_at: optionalTime(row.recorded_at), effective_from: optionalTime(row.effective_from) };
    });
    const events = data.events.map(value => {
      const row = object(value); source(row);
      return { id: textValue(row.id), job_id: textValue(row.job_id), source: textValue(row.source), external_id: textValue(row.external_id),
        event_type: textValue(row.event_type), provenance: row.provenance as EventRecord["provenance"], producer: textValue(row.producer),
        time_kind: row.time_kind as EventRecord["time_kind"],
        occurred_at_raw: row.occurred_at_raw === null ? null : textValue(row.occurred_at_raw), occurred_at: optionalTime(row.occurred_at) };
    });
    const ids = new Set(jobs.map(job => job.id));
    const keys = new Set(jobs.map(job => JSON.stringify([job.source, job.external_id])));
    if (ids.size !== jobs.length || keys.size !== jobs.length || [...claims, ...events].some(row => !ids.has(row.job_id))) throw new Error();
    // Reuse the frozen engine's source/time/link checks, without duplicating rules.
    evaluateEvidence({ claims, events });
    return { jobs: jobs.sort((a, b) => a.external_id < b.external_id ? -1 : a.external_id > b.external_id ? 1 : a.id < b.id ? -1 : 1),
      claims: claims.sort((a, b) => a.id < b.id ? -1 : 1), events: events.sort((a, b) => a.id < b.id ? -1 : 1) };
  } catch { throw new WorkshopReadError("INVALID_RECORDS"); }
}

export async function loadOperationalSnapshot(reader: SnapshotReader = readLinkedSnapshot) {
  return normalizeSnapshot(await reader());
}

/** Human decisions are optional in the read payload (M05 readers and the C02
 * transformer include none). Invalid decision rows fail the whole read closed. */
export function normalizeDecisions(value: unknown): HumanDecision[] {
  try {
    const data = object(value);
    if (!Object.hasOwn(data, "decisions")) return [];
    if (!Array.isArray(data.decisions)) throw new Error();
    return data.decisions
      .map((row) => parseHumanDecisionRecord(row))
      .sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
  } catch { throw new WorkshopReadError("INVALID_RECORDS"); }
}

/** Reads persisted human decisions if available; gracefully returns empty if
 * the remote table or migration has not yet been applied. */
export async function readLinkedDecisions(): Promise<HumanDecision[]> {
  if (process.env.NODE_ENV !== "development") return [];
  const root = process.cwd();
  try {
    const configured = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const ref = (await readFile(resolve(root, "supabase/.temp/project-ref"), "utf8")).trim();
    if (!/^[a-z0-9]{20}$/.test(ref) || configured.protocol !== "https:" || configured.hostname !== `${ref}.supabase.co`) {
      return [];
    }
    const { stdout } = await execute(process.execPath, [
      resolve(root, "node_modules/supabase/dist/supabase.js"), "db", "query", "--linked",
      "--file", resolve(root, "supabase/queries/human-decisions.sql"), "--output-format", "json", "--log-level", "none",
    ], { cwd: root, timeout: 10_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" } });
    const response: unknown = JSON.parse(stdout);
    if (!response || typeof response !== "object" || !("rows" in response) ||
      !Array.isArray(response.rows) || response.rows.length !== 1) return [];
    const rows = (response.rows[0] as { decisions: unknown }).decisions;
    return normalizeDecisions({ decisions: rows });
  } catch (error) {
    if (error instanceof WorkshopReadError && error.code === "INVALID_RECORDS") {
      throw error;
    }
    return [];
  }
}

export function normalizeMemories(value: unknown): ResolutionMemory[] {
  try {
    const data = object(value);
    if (!Object.hasOwn(data, "memories")) return [];
    if (!Array.isArray(data.memories)) throw new Error();
    return data.memories
      .map((row) => parseResolutionMemoryRecord(row))
      .sort((a, b) => a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);
  } catch {
    throw new WorkshopReadError("INVALID_RECORDS");
  }
}

export async function readLinkedMemories(): Promise<ResolutionMemory[]> {
  if (process.env.NODE_ENV !== "development") return [];
  const root = process.cwd();
  try {
    const configured = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const ref = (await readFile(resolve(root, "supabase/.temp/project-ref"), "utf8")).trim();
    if (!/^[a-z0-9]{20}$/.test(ref) || configured.protocol !== "https:" || configured.hostname !== `${ref}.supabase.co`) {
      return [];
    }
    const { stdout } = await execute(process.execPath, [
      resolve(root, "node_modules/supabase/dist/supabase.js"), "db", "query", "--linked",
      "--file", resolve(root, "supabase/queries/resolution-memories.sql"), "--output-format", "json", "--log-level", "none",
    ], { cwd: root, timeout: 10_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" } });
    const response: unknown = JSON.parse(stdout);
    if (!response || typeof response !== "object" || !("rows" in response) ||
      !Array.isArray(response.rows) || response.rows.length !== 1) return [];
    const rows = (response.rows[0] as { memories: unknown }).memories;
    return normalizeMemories({ memories: rows });
  } catch (error) {
    if (error instanceof WorkshopReadError && error.code === "INVALID_RECORDS") {
      throw error;
    }
    return [];
  }
}

/** One consistent read yields the source snapshot plus persisted decisions and memories.
 * Core source records (jobs, claims, events) retain fail-closed behavior;
 * human decisions and memories degrade independently if their persistence layer is unavailable.
 */
export async function loadOperationalWorkspace(
  reader?: SnapshotReader,
  decisionsReader?: () => Promise<unknown>,
  memoriesReader?: () => Promise<unknown>,
): Promise<OperationalWorkspace> {
  if (reader) {
    const raw = await reader();
    const data = object(raw);
    const snapshot = normalizeSnapshot(raw);
    let decisions: HumanDecision[] = [];
    let memories: ResolutionMemory[] = [];
    if (Object.hasOwn(data, "decisions")) {
      decisions = normalizeDecisions(raw);
    } else if (decisionsReader) {
      try {
        const decisionsRaw = await decisionsReader();
        decisions = normalizeDecisions({ decisions: decisionsRaw });
      } catch (error) {
        if (error instanceof WorkshopReadError && error.code === "INVALID_RECORDS") throw error;
        decisions = [];
      }
    }
    if (Object.hasOwn(data, "memories")) {
      memories = normalizeMemories(raw);
    } else if (memoriesReader) {
      try {
        const memoriesRaw = await memoriesReader();
        memories = normalizeMemories({ memories: memoriesRaw });
      } catch (error) {
        if (error instanceof WorkshopReadError && error.code === "INVALID_RECORDS") throw error;
        memories = [];
      }
    }
    return { snapshot, decisions, memories };
  }
  const snapshotRaw = await readLinkedSnapshot();
  const snapshot = normalizeSnapshot(snapshotRaw);
  let decisions: HumanDecision[] = [];
  try {
    decisions = await readLinkedDecisions();
  } catch (error) {
    if (error instanceof WorkshopReadError && error.code === "INVALID_RECORDS") {
      throw error;
    }
    decisions = [];
  }
  let memories: ResolutionMemory[] = [];
  try {
    memories = await readLinkedMemories();
  } catch (error) {
    if (error instanceof WorkshopReadError && error.code === "INVALID_RECORDS") {
      throw error;
    }
    memories = [];
  }
  return { snapshot, decisions, memories };
}
