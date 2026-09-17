-- Optional server-side human decisions read. Never interpolate route, search or user input here.
begin read only;
select coalesce(pg_catalog.json_agg(d order by d."createdAt"), '[]'::json) as decisions from
  (select id, job_id as "jobId", investigation_plan_id as "investigationPlanId",
    decision_type as "decisionType", selected_next_step as "selectedNextStep",
    correction_text as "correctionText", correction_reason as "correctionReason",
    human_evidence_reference as "humanEvidenceReference", reviewer,
    created_at as "createdAt", provenance,
    source_generated_plan_version as "sourceGeneratedPlanVersion",
    source_finding_ids as "sourceFindingIds",
    source_claim_ids as "sourceClaimIds",
    source_event_ids as "sourceEventIds"
    from public.human_decisions) d;
commit;

