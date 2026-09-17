import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimRecord, EventRecord, JobRecord, SourceRef } from "@/domain/operational-model";
import type { FixtureRepository } from "./c02";

/** An injected client retains its own database permissions. No RLS bypass or
 * credentials are created here. Public application clients are denied by M02 SQL.
 */
export class SupabaseOperationalRepository implements FixtureRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findJob(ref: SourceRef): Promise<JobRecord | null> {
    const { data, error } = await this.client.from("jobs")
      .select("id,source,external_id,provenance,producer")
      .eq("source", ref.source).eq("external_id", ref.external_id).maybeSingle();
    if (error) throw new Error("Job lookup failed.");
    return data as JobRecord | null;
  }

  private async append(table: "jobs" | "job_claims" | "events", record: JobRecord | ClaimRecord | EventRecord) {
    // DO NOTHING on repeated identity: never rewrite original evidence/provenance.
    const payload: Record<string, unknown> = { ...record };
    const { error } = await this.client.from(table)
      .upsert(payload, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`Source append failed for ${table}.`);
    const { data, error: readError } = await this.client.from(table)
      .select(Object.keys(record).join(",")).eq("id", record.id).single();
    if (readError || !data) throw new Error(`Source verification failed for ${table}.`);
    const stored = data as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      const actual = stored[key];
      const equivalent = ["occurred_at", "recorded_at", "effective_from"].includes(key) &&
        typeof actual === "string" && typeof value === "string"
        ? Date.parse(actual) === Date.parse(value) : actual === value;
      if (!equivalent) throw new Error(`Conflicting source identity in ${table}; original retained.`);
    }
  }

  appendJob(record: JobRecord) { return this.append("jobs", record); }
  appendClaim(record: ClaimRecord) { return this.append("job_claims", record); }
  appendEvent(record: EventRecord) { return this.append("events", record); }
}
