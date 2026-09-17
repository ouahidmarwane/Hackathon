import { isDataProvenance } from "./contracts";

export type SourceProvenance = "SUPPLIED" | "SYNTHETIC" | "INTEGRATION";
export type SourceRef = { source: string; external_id: string };
export type OccurrenceTime =
  | { kind: "unknown" }
  | { kind: "clock"; raw: string }
  | { kind: "timestamp"; raw: string };
export type EventInput = {
  job: SourceRef;
  external_id: string;
  event_type: string;
  provenance: SourceProvenance;
  time: OccurrenceTime;
};

export type JobRecord = SourceRef & {
  id: string;
  provenance: SourceProvenance;
  producer: string;
};
export type ClaimRecord = {
  id: string;
  job_id: string;
  source: string;
  source_record_ref: string;
  property: string;
  value: string;
  provenance: SourceProvenance;
  producer: string;
  recorded_at: string | null;
  effective_from: string | null;
};
export type EventRecord = SourceRef & {
  id: string;
  job_id: string;
  event_type: string;
  provenance: SourceProvenance;
  producer: string;
  time_kind: OccurrenceTime["kind"];
  occurred_at_raw: string | null;
  occurred_at: string | null;
};

export class IngestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestionError";
  }
}

// Strict objects deliberately exclude arbitrary payloads and nested intelligence.
export function strictObject(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IngestionError("Expected an object.");
  }
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !keys.includes(key))) {
    throw new IngestionError("Unexpected input field.");
  }
  return object;
}

export function textValue(value: unknown): string {
  if (
    typeof value !== "string" || !value.trim() || value.length > 200 ||
    value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)
  ) throw new IngestionError("Expected nonempty text of at most 200 characters.");
  return value;
}

export function validateSourceRef(value: unknown): SourceRef {
  const input = strictObject(value, ["source", "external_id"]);
  const source = textValue(input.source);
  if (!/^[a-z0-9][a-z0-9._:-]*$/.test(source)) {
    throw new IngestionError("Invalid source namespace.");
  }
  return { source, external_id: textValue(input.external_id) };
}

export function validateTime(value: unknown): OccurrenceTime {
  const input = strictObject(value, ["kind", "raw"]);
  // JS regex `$` also matches before a final newline. Reject controls explicitly.
  if (Object.hasOwn(input, "raw")) textValue(input.raw);
  if (input.kind === "unknown" && !Object.hasOwn(input, "raw")) {
    return { kind: "unknown" };
  }
  if (input.kind === "clock" && typeof input.raw === "string" &&
      /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(input.raw)) {
    return { kind: "clock", raw: input.raw };
  }
  if (input.kind === "timestamp" && typeof input.raw === "string" &&
      /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/.test(input.raw)) {
    const date = input.raw.slice(0, 10);
    const calendar = Date.parse(`${date}T00:00:00Z`);
    if (!date.startsWith("0000-") && Number.isFinite(calendar) && new Date(calendar).toISOString().slice(0, 10) === date &&
        Number.isFinite(Date.parse(input.raw))) {
      return { kind: "timestamp", raw: input.raw };
    }
  }
  throw new IngestionError("Invalid occurrence time; timestamps require date and offset.");
}

export function validateEventInput(value: unknown): EventInput {
  const input = strictObject(value, ["job", "external_id", "event_type", "provenance", "time"]);
  if (!isDataProvenance(input.provenance) ||
      !["SUPPLIED", "SYNTHETIC", "INTEGRATION"].includes(input.provenance)) {
    throw new IngestionError("Only source provenance is accepted in M02.");
  }
  return {
    job: validateSourceRef(input.job),
    external_id: textValue(input.external_id),
    event_type: textValue(input.event_type),
    provenance: input.provenance as SourceProvenance,
    time: validateTime(input.time),
  };
}
