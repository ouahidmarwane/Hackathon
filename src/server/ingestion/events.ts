import "server-only";
import {
  IngestionError, validateEventInput, validateSourceRef, textValue,
  type EventRecord, type JobRecord, type SourceRef, type SourceProvenance,
} from "@/domain/operational-model";
import { sourceIdentity } from "./identity";

/** Internal server capability. Never deserialize this from producer input.
 * Integration adapters must establish authentication before supplying context.
 * M02 exposes no HTTP action, adapter registration, or credential-based writer.
 */
export type ProducerContext =
  | { kind: "fixture"; source: "c02-supplied"; producer: "fixture-loader" }
  | { kind: "synthetic"; source: string; producer: string }
  | { kind: "integration"; source: string; producer: string; authenticated: true };

export interface EventRepository {
  findJob(ref: SourceRef): Promise<JobRecord | null>;
  appendEvent(record: EventRecord): Promise<void>;
}

export function authorizeSource(context: ProducerContext, provenance: SourceProvenance) {
  validateSourceRef({ source: context.source, external_id: "context" });
  textValue(context.producer);
  const permitted =
    (context.kind === "fixture" && context.source === "c02-supplied" &&
      context.producer === "fixture-loader" && provenance === "SUPPLIED") ||
    (context.kind === "synthetic" && context.source.startsWith("synthetic:") && provenance === "SYNTHETIC") ||
    (context.kind === "integration" && context.source.startsWith("integration:") &&
      context.authenticated === true && provenance === "INTEGRATION");
  if (!permitted) throw new IngestionError("Producer is not authorized for this source provenance.");
}

/** Shared validation/relationship boundary, also used before fixture persistence. */
export async function prepareEvent(
  value: unknown, context: ProducerContext, repository: Pick<EventRepository, "findJob">,
): Promise<EventRecord> {
  const input = validateEventInput(value);
  authorizeSource(context, input.provenance);
  const job = await repository.findJob(input.job);
  if (!job || job.source !== input.job.source || job.external_id !== input.job.external_id) {
    throw new IngestionError("Unknown job reference.");
  }
  return {
    id: sourceIdentity("event", context.source, input.external_id),
    job_id: job.id, source: context.source, external_id: input.external_id,
    event_type: input.event_type, provenance: input.provenance, producer: context.producer,
    time_kind: input.time.kind,
    occurred_at_raw: input.time.kind === "unknown" ? null : input.time.raw,
    occurred_at: input.time.kind === "timestamp" ? new Date(input.time.raw).toISOString() : null,
  };
}

export async function ingestEvent(value: unknown, context: ProducerContext, repository: EventRepository) {
  const record = await prepareEvent(value, context, repository);
  await repository.appendEvent(record);
  return record;
}
