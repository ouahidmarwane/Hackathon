import { describe, expect, it, vi } from "vitest";
import { validateEventInput, validateTime, type ClaimRecord, type EventRecord, type JobRecord, type SourceRef } from "@/domain/operational-model";
import { ingestEvent, type ProducerContext } from "@/server/ingestion/events";
import { loadC02, transformC02, type FixtureRepository } from "@/server/ingestion/c02";
import { sourceIdentity } from "@/server/ingestion/identity";
import fixture from "../../fixtures/c02/c02-supplied.json";

class MemoryRepository implements FixtureRepository {
  jobs = new Map<string, JobRecord>();
  claims = new Map<string, ClaimRecord>();
  events = new Map<string, EventRecord>();
  private append<T extends { id: string }>(records: Map<string, T>, record: T) {
    const previous = records.get(record.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(record)) throw new Error("Conflicting source identity");
    records.set(record.id, structuredClone(record));
  }
  async findJob(ref: SourceRef) {
    return [...this.jobs.values()].find((job) => job.source === ref.source && job.external_id === ref.external_id) ?? null;
  }
  async appendJob(record: JobRecord) { this.append(this.jobs, record); }
  async appendClaim(record: ClaimRecord) { this.append(this.claims, record); }
  async appendEvent(record: EventRecord) { this.append(this.events, record); }
}

const supplied = { kind: "fixture", source: "c02-supplied", producer: "fixture-loader" } as const;
const event = {
  job: { source: "c02-supplied", external_id: "W-1" },
  external_id: "R-1", event_type: "part scan", provenance: "SUPPLIED",
  time: { kind: "clock", raw: "08:40" },
};

describe("strict ingestion inputs", () => {
  it.each(["invalid", "supplied", "GENERATED", "HUMAN_VALIDATED", null])("rejects provenance %s", (provenance) => {
    expect(() => validateEventInput({ ...event, provenance })).toThrow();
  });
  it.each(["evidence_classification", "operational_diagnosis", "ai_conclusion", "priority", "human_validation", "recommendation_result", "payload", "producer", "source"])("rejects field %s", (field) => {
    expect(() => validateEventInput({ ...event, [field]: "injected" })).toThrow(/Unexpected/);
  });
  it("rejects hidden nested intelligence", () => {
    expect(() => validateEventInput({ ...event, job: { ...event.job, diagnosis: "blocked" } })).toThrow();
    expect(() => validateEventInput({ ...event, time: { ...event.time, priority: 1 } })).toThrow();
  });
  it.each(["", "  ", " scan", "scan\n", "x".repeat(201)])("rejects invalid event type", (event_type) => {
    expect(() => validateEventInput({ ...event, event_type })).toThrow();
  });
  it("rejects malformed job identities and missing fields", () => {
    expect(() => validateEventInput({ ...event, job: "W-1" })).toThrow();
    expect(() => validateEventInput({ ...event, job: { source: "", external_id: "W-1" } })).toThrow();
    expect(() => validateEventInput({ ...event, external_id: undefined })).toThrow();
    expect(() => validateEventInput(null)).toThrow();
  });
});

describe("occurrence time", () => {
  it.each(["08:40", "08:50", "23:59:59"])("preserves clock text %s", (raw) => {
    expect(validateTime({ kind: "clock", raw })).toEqual({ kind: "clock", raw });
  });
  it.each([
    { kind: "clock", raw: "24:00" }, { kind: "clock", raw: "08:60" },
    { kind: "clock", raw: "8:40" }, { kind: "clock", raw: "08:40Z" },
    { kind: "clock", raw: "08:40\n" }, { kind: "clock", raw: "08:50\r\n" },
    { kind: "timestamp", raw: "08:40" }, { kind: "timestamp", raw: "2026-09-17T08:40:00" },
    { kind: "timestamp", raw: "2026-02-30T08:40:00Z" },
    { kind: "timestamp", raw: "0000-01-01T08:40:00Z" },
    { kind: "timestamp", raw: "2026-09-17T08:40:00+14:30" },
    { kind: "unknown", raw: "08:40" }, { kind: "clock" },
  ])("rejects invalid representation $raw", (time) => expect(() => validateTime(time)).toThrow());
  it("accepts unknown time and explicit-offset timestamps", () => {
    expect(validateTime({ kind: "unknown" })).toEqual({ kind: "unknown" });
    expect(validateTime({ kind: "timestamp", raw: "2024-02-29T08:40:00+01:00" })).toEqual({ kind: "timestamp", raw: "2024-02-29T08:40:00+01:00" });
  });
});

describe("producer and persistence boundary", () => {
  it("rejects an unknown job before persistence", async () => {
    const repository = new MemoryRepository();
    const append = vi.spyOn(repository, "appendEvent");
    await expect(ingestEvent(event, supplied, repository)).rejects.toThrow(/Unknown job/);
    expect(append).not.toHaveBeenCalled();
  });
  it("validates input before even looking up a job", async () => {
    const repository = new MemoryRepository();
    const lookup = vi.spyOn(repository, "findJob");
    await expect(ingestEvent({ ...event, priority: 1 }, supplied, repository)).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();
  });
  it("does not let a simulator spoof supplied, integration, or human validation", async () => {
    const repository = new MemoryRepository();
    await loadC02(repository);
    const simulator = { kind: "synthetic", source: "synthetic:demo", producer: "future-simulator" } as const;
    for (const provenance of ["SUPPLIED", "INTEGRATION", "HUMAN_VALIDATED"]) {
      await expect(ingestEvent({ ...event, provenance }, simulator, repository)).rejects.toThrow();
    }
    expect(repository.events.size).toBe(2);
  });
  it("allows synthetic observations through the same boundary", async () => {
    const repository = new MemoryRepository();
    await loadC02(repository);
    const result = await ingestEvent({ ...event, provenance: "SYNTHETIC" },
      { kind: "synthetic", source: "synthetic:demo", producer: "manual-demo" }, repository);
    expect(result.provenance).toBe("SYNTHETIC");
    expect(result.source).toBe("synthetic:demo");
    expect(result.occurred_at).toBeNull();
    expect(repository.events.size).toBe(3);
  });
  it("requires trusted authenticated context for integration provenance", async () => {
    const repository = new MemoryRepository();
    await loadC02(repository);
    const context = { kind: "integration", source: "integration:workshop-a", producer: "adapter", authenticated: true } as const;
    await expect(ingestEvent({ ...event, provenance: "INTEGRATION" },
      { ...context, authenticated: false } as unknown as ProducerContext, repository)).rejects.toThrow();
    const result = await ingestEvent({ ...event, provenance: "INTEGRATION", time: { kind: "timestamp", raw: "2026-09-17T08:40:00+01:00" } }, context, repository);
    expect(result.occurred_at_raw).toBe("2026-09-17T08:40:00+01:00");
    expect(result.occurred_at).toBe("2026-09-17T07:40:00.000Z");
  });
  it("propagates persistence failure rather than reporting success", async () => {
    const repository = new MemoryRepository();
    await loadC02(repository);
    vi.spyOn(repository, "appendEvent").mockRejectedValue(new Error("persistence denied"));
    await expect(ingestEvent(event, supplied, repository)).rejects.toThrow(/denied/);
  });
});

describe("C02 source import", () => {
  it("transforms deterministically with stable unique identities and exact counts", async () => {
    const first = await transformC02();
    expect(first).toEqual(await transformC02());
    expect([first.jobs.length, first.claims.length, first.events.length, first.rules.length]).toEqual([4, 14, 2, 3]);
    const rows = [...first.jobs, ...first.claims, ...first.events];
    expect(new Set(rows.map((row) => row.id)).size).toBe(20);
    expect(rows.every((row) => row.provenance === "SUPPLIED")).toBe(true);
    expect(rows.every((row) => /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.id))).toBe(true);
  });
  it.each(["W-1", "W-2", "W-3", "W-4"])("preserves %s and every supplied field", async (external_id) => {
    const batch = await transformC02();
    const job = batch.jobs.find((row) => row.external_id === external_id)!;
    const original = fixture.jobs.find((row) => row.job_id === external_id)!;
    const claims = batch.claims.filter((claim) => claim.job_id === job.id);
    expect(Object.fromEntries(claims.map((claim) => [claim.property, claim.value]))).toEqual(original.fields);
    expect(claims.every((claim) => claim.source_record_ref === external_id && claim.recorded_at === null && claim.effective_from === null)).toBe(true);
  });
  it.each([["R-1", "W-1", "08:40"], ["E-2", "W-2", "08:50"]])("preserves event %s and clock uncertainty", async (external_id, jobRef, raw) => {
    const batch = await transformC02();
    const row = batch.events.find((row) => row.external_id === external_id)!;
    expect(row.job_id).toBe(batch.jobs.find((job) => job.external_id === jobRef)!.id);
    expect(row).toMatchObject({ time_kind: "clock", occurred_at_raw: raw, occurred_at: null, provenance: "SUPPLIED" });
  });
  it("preserves all three supplied rules verbatim", async () => {
    expect((await transformC02()).rules).toEqual(fixture.rules);
  });
  it("repeated loading creates no logical duplicates", async () => {
    const repository = new MemoryRepository();
    expect(await loadC02(repository)).toEqual({ jobs: 4, claims: 14, events: 2, rules: 3 });
    await loadC02(repository);
    expect([repository.jobs.size, repository.claims.size, repository.events.size]).toEqual([4, 14, 2]);
  });
  it("can resume partial setup safely", async () => {
    const repository = new MemoryRepository();
    const append = vi.spyOn(repository, "appendClaim").mockRejectedValueOnce(new Error("interrupted"));
    await expect(loadC02(repository)).rejects.toThrow();
    append.mockRestore();
    await loadC02(repository);
    expect([repository.jobs.size, repository.claims.size, repository.events.size]).toEqual([4, 14, 2]);
  });
  it("rejects conflicting reuse rather than rewriting source evidence", async () => {
    const repository = new MemoryRepository();
    await loadC02(repository);
    await expect(ingestEvent({ ...event, event_type: "changed observation" }, supplied, repository)).rejects.toThrow(/Conflicting/);
    expect([...repository.events.values()].find((row) => row.external_id === "R-1")!.event_type).toBe("part scan");
  });
  it("separates namespaces, record kinds, and ambiguous tuple concatenation", () => {
    expect(sourceIdentity("event", "integration:a", "R-1")).not.toBe(sourceIdentity("event", "integration:b", "R-1"));
    expect(sourceIdentity("event", "a", "bc")).not.toBe(sourceIdentity("event", "ab", "c"));
    expect(sourceIdentity("job", "a", "R-1")).not.toBe(sourceIdentity("event", "a", "R-1"));
  });
});
