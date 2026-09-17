import "server-only";
import fixture from "../../../fixtures/c02/c02-supplied.json";
import { textValue, validateSourceRef, type ClaimRecord, type JobRecord, type SourceRef } from "@/domain/operational-model";
import { authorizeSource, ingestEvent, prepareEvent, type EventRepository, type ProducerContext } from "./events";
import { sourceIdentity } from "./identity";

const context = { kind: "fixture", source: "c02-supplied", producer: "fixture-loader" } as const satisfies ProducerContext;

/** Reads the committed fixture only. No synthetic enrichment or wall-clock metadata. */
export async function transformC02() {
  const jobs: JobRecord[] = fixture.jobs.map((job) => {
    if (job.provenance !== "SUPPLIED") throw new Error("C02 provenance changed.");
    authorizeSource(context, job.provenance);
    return {
      id: sourceIdentity("job", context.source, job.job_id),
      ...validateSourceRef({ source: context.source, external_id: job.job_id }),
      provenance: "SUPPLIED", producer: context.producer,
    };
  });
  const claims: ClaimRecord[] = fixture.jobs.flatMap((job, index) =>
    Object.entries(job.fields).map(([property, value]) => ({
      id: sourceIdentity("claim", context.source, job.job_id, property),
      job_id: jobs[index].id, source: context.source, source_record_ref: job.job_id,
      property: textValue(property), value: textValue(value), provenance: "SUPPLIED", producer: context.producer,
      recorded_at: null, effective_from: null,
    })),
  );
  const lookup = {
    async findJob(ref: SourceRef) {
      return jobs.find((job) => job.source === ref.source && job.external_id === ref.external_id) ?? null;
    },
  };
  const inputs = fixture.events.map((event) => ({
    job: { source: context.source, external_id: event.fields.job_id },
    external_id: event.event_id, event_type: event.fields.event, provenance: event.provenance,
    time: { kind: "clock", raw: event.fields.time },
  }));
  const events = await Promise.all(inputs.map((input) => prepareEvent(input, context, lookup)));
  const rules = fixture.rules.map((rule) => {
    if (rule.provenance !== "SUPPLIED") throw new Error("C02 rule provenance changed.");
    return { ...rule };
  });
  return { jobs, claims, events, rules, inputs };
}

export interface FixtureRepository extends EventRepository {
  appendJob(record: JobRecord): Promise<void>;
  appendClaim(record: ClaimRecord): Promise<void>;
}

/** Explicit invocation only; not wired to a page, build, route, or automatic seed.
 * Sequential append-only writes permit safe retries after partial setup.
 */
export async function loadC02(repository: FixtureRepository) {
  const batch = await transformC02(); // Validate all source events before any writes.
  for (const job of batch.jobs) await repository.appendJob(job);
  for (const claim of batch.claims) await repository.appendClaim(claim);
  for (const input of batch.inputs) await ingestEvent(input, context, repository);
  return { jobs: batch.jobs.length, claims: batch.claims.length, events: batch.events.length, rules: batch.rules.length };
}
