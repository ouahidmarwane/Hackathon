import { beforeAll, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { transformC02 } from "@/server/ingestion/c02";
import { normalizeSnapshot } from "@/server/control-tower/loader";
import { evaluateEvidence } from "@/domain/evidence-engine";
import { buildTowerView, type CaseView } from "@/presentation/control-tower";
import { buildWorkshopPipeline, pipelineDisplay } from "@/presentation/workshop-pipeline";
import { OperationalJourney } from "@/components/control-tower/operational-journey";

let cases: CaseView[];
beforeAll(async () => { const source = normalizeSnapshot(await transformC02()); cases = buildTowerView(source, evaluateEvidence(source)).cases; });

it("defines one connected product lifecycle, separate from challenge evidence", () => {
  const model = buildWorkshopPipeline(cases[0]);
  expect(model.stages.map(stage => stage.label)).toEqual(["Reception", "Diagnosis", "Parts / Approval", "Repair", "Quality check", "Ready", "Collection"]);
  expect(model.stages.every(stage => stage.context === "PRODUCT_WORKFLOW_TEMPLATE")).toBe(true);
  expect(model.stages.every(stage => !Object.hasOwn(stage, "provenance"))).toBe(true);
  const markup = renderToStaticMarkup(<OperationalJourney item={cases[0]} />);
  const process = markup.split('<ol class="workshop-pipeline"')[1].split('</ol>')[0];
  expect((process.match(/data-stage=/g) ?? [])).toHaveLength(7);
  expect(markup).toContain("Process map, not observed history");
  expect(markup).not.toContain('class="journey-pipeline"');
});
it.each([[0, "parts-approval", "Awaiting parts"], [1, "repair", "Repair paused"], [2, "quality-check", "Quality check"], [3, "ready", "Ready"]] as const)("maps case %i to its recorded process position", (index, id, title) => {
  const model = buildWorkshopPipeline(cases[index]);
  expect(model.stages.filter(stage => stage.recorded.length).map(stage => stage.id)).toEqual([id]);
  expect(model.stages.find(stage => stage.id === id)!.recorded[0]).toMatchObject({ title, provenance: "SUPPLIED" });
  const markup = renderToStaticMarkup(<OperationalJourney item={cases[index]} />);
  expect(markup).toContain(`class="process-stage recorded-position" data-stage="${id}"`);
});
it.each([0, 1, 2, 3])("does not invent historical completion or stage times for case %i", index => {
  const model = buildWorkshopPipeline(cases[index]);
  for (const stage of model.stages) {
    expect(stage).not.toHaveProperty("completed"); expect(stage).not.toHaveProperty("time_raw");
  }
  const markup = renderToStaticMarkup(<OperationalJourney item={cases[index]} />);
  const process = markup.split('<ol class="workshop-pipeline"')[1].split('</ol>')[0];
  expect(process).not.toMatch(/stage-completed|Verified complete|Completed stage/);
  expect((process.match(/position-unverified/g) ?? [])).toHaveLength(6);
});
it("groups W-1 handoff, receipt and recorded-stage requirements at Parts / Approval", () => {
  const model = buildWorkshopPipeline(cases[0]); const area = model.stages.find(stage => stage.id === "parts-approval")!;
  expect(area.events[0]).toMatchObject({ event_ref: "R-1", time_raw: "08:40", support_labels: ["Receipt reference supported"] });
  expect(area.issues.flatMap(issue => issue.missing_codes)).toEqual(["PART_TO_JOB_HANDOFF_CONFIRMATION", "PART_RECEIPT_CONFIRMATION", "STAGE_CONFIRMATION"]);
  expect(model.unplaced.issues[0].missing_codes).toEqual(["OWNER_ASSIGNMENT_CONFIRMATION"]);
  const markup = renderToStaticMarkup(<OperationalJourney item={cases[0]} />);
  expect(markup).toContain("3 verification gaps"); expect(markup).toContain("Part-to-job / technician handoff · Not confirmed");
  expect(markup).toContain('aria-controls="'+area.issues[0].id+'-panel"');
  expect(markup).toContain('class="selected-investigation"'); expect(markup).toContain('hidden=""');
});
it("attaches W-2 preparation and dispatch/response evidence to approval without moving its recorded repair position", () => {
  const model = buildWorkshopPipeline(cases[1]); const approval = model.stages.find(stage => stage.id === "parts-approval")!;
  expect(approval.recorded).toEqual([]);
  expect(approval.events[0]).toMatchObject({ event_ref: "E-2", time_raw: "08:50" });
  expect(approval.issues.flatMap(issue => issue.missing_codes)).toContain("APPROVAL_REQUEST_DISPATCH_CONFIRMATION");
  expect(approval.issues.flatMap(issue => issue.missing_codes)).toContain("CUSTOMER_APPROVAL_RESPONSE");
  expect(model.stages.find(stage => stage.id === "repair")!.recorded[0].title).toBe("Repair paused");
});
it("keeps W-3 offline as recorded context and W-4 readiness unverified", () => {
  for (const index of [2, 3]) expect(buildWorkshopPipeline(cases[index]).stages.flatMap(stage => stage.events)).toEqual([]);
  expect(buildWorkshopPipeline(cases[2]).stages.find(stage => stage.id === "quality-check")!.issues.flatMap(issue => issue.missing_codes)).toContain("QUALITY_CHECK_PROGRESS_CONFIRMATION");
  expect(buildWorkshopPipeline(cases[3]).stages.find(stage => stage.id === "ready")!.issues.flatMap(issue => issue.missing_codes)).toContain("OPERATIONAL_READINESS_CONFIRMATION");
});
it("preserves unknown source positions/events without inventing workflow placement", () => {
  const item = structuredClone(cases[0]);
  item.claims.find(claim => claim.property === "stage")!.value = "unmapped source stage";
  item.events[0].event_type = "unmapped source observation";
  const model = buildWorkshopPipeline(item);
  expect(model.stages.flatMap(stage => stage.recorded)).toEqual([]);
  expect(model.unplaced.recorded[0].title).toBe("Unmapped source stage");
  expect(model.unplaced.events[0].title).toBe("Unmapped source observation");
});
it("adapts to additional actual events and removed finding requirements without mutating input", () => {
  const item = structuredClone(cases[0]); const before = JSON.stringify(item);
  buildWorkshopPipeline(item); expect(JSON.stringify(item)).toBe(before);
  item.job.external_id = "OTHER-ORDER";
  item.events.push({ ...item.events[0], id: "additional", external_id: "additional", time_kind: "unknown", occurred_at_raw: null });
  item.findings = item.findings.map(finding => ({ ...finding, missing_evidence: finding.missing_evidence.filter(code => code !== "PART_TO_JOB_HANDOFF_CONFIRMATION") }));
  const model = buildWorkshopPipeline(item);
  expect(model.stages.find(stage => stage.id === "parts-approval")!.events).toHaveLength(2);
  expect(model.stages.flatMap(stage => stage.issues).some(issue => issue.missing_codes.includes("PART_TO_JOB_HANDOFF_CONFIRMATION"))).toBe(false);
  expect(pipelineDisplay(model).stages.flatMap(stage => stage.events).some(event => event.time_raw === null)).toBe(true);
});
it("projects minimal client display data and provides connected vertical layout rules", () => {
  const dto = pipelineDisplay(buildWorkshopPipeline(cases[0]));
  for (const stage of dto.stages) for (const node of [...stage.recorded, ...stage.events, ...stage.issues]) {
    expect(node).not.toHaveProperty("source_claim_ids"); expect(node).not.toHaveProperty("claim_ids");
    expect(node).not.toHaveProperty("missing_codes"); expect(node).not.toHaveProperty("producer");
  }
  const css = readFileSync("src/app/globals.css", "utf8");
  expect(css).toContain("grid-template-columns: repeat(7, minmax(0, 1fr))");
  expect(css).toContain(".process-stage::before"); expect(css).toContain(".workshop-pipeline { display: block");
  expect(css).toContain("border-left: 1px dashed");
});
