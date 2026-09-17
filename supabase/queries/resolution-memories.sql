-- Server-side resolution memories read. Never interpolate route, search or user input here.
begin read only;
select coalesce(pg_catalog.json_agg(m order by m."createdAt" desc), '[]'::json) as memories from
  (select id,
    job_id as "jobId",
    external_job_id as "externalJobId",
    decision_id as "decisionId",
    stage,
    missing_evidence_codes as "missingEvidenceCodes",
    rule_code as "ruleCode",
    category,
    lesson,
    source_refs as "sourceRefs",
    validated_by as "validatedBy",
    provenance,
    created_at as "createdAt"
    from public.resolution_memories) m;
commit;

