import { beforeAll, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { transformC02 } from "@/server/ingestion/c02";
import { normalizeSnapshot } from "@/server/control-tower/loader";
import { evaluateEvidence } from "@/domain/evidence-engine";
import { createDeterministicPlan } from "@/server/investigation/provider";
import { InvestigationGuidance } from "@/components/control-tower/investigation-guidance";
import { HumanReview } from "@/components/human-review/human-review";
import type { HumanDecision } from "@/domain/human-decision";

let plan: ReturnType<typeof createDeterministicPlan>;
beforeAll(async () => {
  const snapshot = normalizeSnapshot(await transformC02());
  const job = snapshot.jobs.find(row => row.external_id === "W-1")!;
  const claims = snapshot.claims.filter(row => row.job_id === job.id);
  const events = snapshot.events.filter(row => row.job_id === job.id);
  plan = createDeterministicPlan({ job, claims, events, findings: evaluateEvidence({ claims, events }) });
});

const decision = (overrides: Partial<HumanDecision> = {}): HumanDecision => ({
  id: "20000000-0000-4000-8000-000000000001",
  jobId: plan.jobId,
  investigationPlanId: plan.id,
  decisionType: "APPROVED",
  selectedNextStep: plan.suggestedNextAction.text,
  correctionText: null,
  correctionReason: null,
  humanEvidenceReference: null,
  reviewer: "Prototype reviewer",
  createdAt: "2026-09-17T14:30:00.000Z",
  provenance: "HUMAN_VALIDATED",
  sourceGeneratedPlanVersion: plan.version,
  sourceFindingIds: plan.sourceFindingIds,
  sourceClaimIds: plan.sourceClaimIds,
  sourceEventIds: plan.sourceEventIds,
  ...overrides,
});

it("adds the human review controls inside the existing investigation guidance", () => {
  const markup = renderToStaticMarkup(<InvestigationGuidance plan={plan} />);
  expect(markup).toContain("Human review");
  expect(markup).toContain("Suggested next step");
  expect(markup).toContain("Approve investigation");
  expect(markup).toContain("Correct");
  expect(markup).toContain("Decision history");
});

it("shows an approval as human review, never as resolution", () => {
  const markup = renderToStaticMarkup(<InvestigationGuidance plan={plan} decisions={[decision()]} />);
  expect(markup).toContain("Investigation path approved");
  expect(markup).toContain("Human validated");
  expect(markup).toContain("provenance-human_validated");
  expect(markup).not.toContain("Issue resolved");
  expect(markup).not.toContain("Investigation resolved");
});

it("shows a correction with its human-supplied text and provenance", () => {
  const markup = renderToStaticMarkup(<InvestigationGuidance plan={plan} decisions={[
    decision({ decisionType: "CORRECTED", correctionText: "The scanned item belongs to another work order." }),
  ]} />);
  expect(markup).toContain("Human correction");
  expect(markup).toContain("The scanned item belongs to another work order.");
  expect(markup).toContain("Human validated");
});

it("renders persisted timestamps and never fakes reviewer identity", () => {
  const markup = renderToStaticMarkup(<HumanReview jobId={plan.jobId} planId={plan.id}
    suggestedNextStep={plan.suggestedNextAction.text} decisions={[decision()]} />);
  expect(markup).toContain('dateTime="2026-09-17T14:30:00.000Z"');
  expect(markup).toContain("Prototype reviewer");
  expect(markup).not.toMatch(/Real manager|authenticated manager|signed in as/);
});
