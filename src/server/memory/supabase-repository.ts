import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseResolutionMemoryRecord,
  type ResolutionMemory,
} from "@/domain/resolution-memory";

export class SupabaseMemoryRepository {
  constructor(private readonly client: SupabaseClient) {}

  private fromRow(row: Record<string, unknown>) {
    return {
      id: row.id,
      jobId: row.job_id,
      externalJobId: row.external_job_id,
      decisionId: row.decision_id,
      stage: row.stage,
      missingEvidenceCodes: row.missing_evidence_codes,
      ruleCode: row.rule_code,
      category: row.category,
      lesson: row.lesson,
      sourceRefs: row.source_refs,
      validatedBy: row.validated_by,
      provenance: row.provenance,
      createdAt: row.created_at,
    };
  }

  async appendMemory(record: Omit<ResolutionMemory, "createdAt"> & { id: string }): Promise<ResolutionMemory> {
    const payload = {
      id: record.id,
      job_id: record.jobId,
      external_job_id: record.externalJobId,
      decision_id: record.decisionId,
      stage: record.stage,
      missing_evidence_codes: record.missingEvidenceCodes,
      rule_code: record.ruleCode,
      category: record.category,
      lesson: record.lesson,
      source_refs: record.sourceRefs,
      validated_by: record.validatedBy,
      provenance: record.provenance,
    };

    const { error } = await this.client.from("resolution_memories")
      .upsert(payload, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`Resolution memory append failed: ${error.message}`);

    const { data, error: readError } = await this.client.from("resolution_memories")
      .select("*").eq("id", record.id).single();
    if (readError || !data) throw new Error("Resolution memory verification failed.");

    const stored = parseResolutionMemoryRecord(this.fromRow(data));
    return stored;
  }

  async listMemories(): Promise<ResolutionMemory[]> {
    const { data, error } = await this.client.from("resolution_memories")
      .select("*").order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list resolution memories: ${error.message}`);
    return (data ?? []).map(row => parseResolutionMemoryRecord(this.fromRow(row)));
  }
}

