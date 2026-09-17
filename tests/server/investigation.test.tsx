import { beforeAll, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { transformC02 } from "@/server/ingestion/c02";
import { normalizeSnapshot } from "@/server/control-tower/loader";
import { evaluateEvidence, MISSING_EVIDENCE, type MissingEvidenceCode } from "@/domain/evidence-engine";
import { buildTowerView, type CaseView } from "@/presentation/control-tower";
import { createDeterministicPlan, DeterministicInvestigationProvider } from "@/server/investigation/provider";
import { INVESTIGATION_RULES } from "@/server/investigation/rules";
import { InvestigationGuidance } from "@/components/control-tower/investigation-guidance";
import { InvestigationSummary } from "@/components/control-tower/investigation-summary";
import { buildOperationalJourney } from "@/presentation/operational-journey";

let cases: CaseView[];
beforeAll(async () => { const source = normalizeSnapshot(await transformC02()); cases = buildTowerView(source, evaluateEvidence(source)).cases; });
const plan = (index: number) => createDeterministicPlan(cases[index]);

it.each([0, 1, 2, 3])("produces deterministic traceable generated guidance without altering facts for case %i", index => {
  const input = cases[index]; const before = JSON.stringify(input); const result = plan(index);
  expect(createDeterministicPlan({ ...input, claims: [...input.claims].reverse(), events: [...input.events].reverse(), findings: [...input.findings].reverse() })).toEqual(result);
  expect(JSON.stringify(input)).toBe(before); expect(result.provenance).toBe("GENERATED");
  expect(result.producer).toBe("deterministic-investigation-provider"); expect(result.version).toBe("investigation/c02/v1");
  expect(result.operationalAction).toBeNull(); expect(result.dependsOnSynthetic).toBe(false);
  const all = [...result.knownFacts, ...result.uncertainties, ...result.investigationSteps, ...result.recordedOwners, result.suggestedNextAction, ...result.rationale];
  for (const statement of all) {
    expect(statement.trace.ruleId).toMatch(/^M05_/);
    for (const id of statement.trace.sourceClaimIds) expect(input.claims.some(claim => claim.id === id)).toBe(true);
    for (const id of statement.trace.sourceEventIds) expect(input.events.some(event => event.id === id)).toBe(true);
    for (const id of statement.trace.sourceFindingIds) expect(input.findings.some(finding => finding.id === id)).toBe(true);
    for (const code of statement.trace.missingEvidenceCodes) expect(input.findings.some(finding => finding.missing_evidence.includes(code as MissingEvidenceCode))).toBe(true);
  }
  expect(result.sourceFindingIds).toEqual(input.findings.map(finding => finding.id).sort());
  expect(result).not.toHaveProperty("confidence"); expect(result).not.toHaveProperty("priority"); expect(result).not.toHaveProperty("severity");
});
it("implements the asynchronous provider interface with the same structured contract", async () => {
  expect(await new DeterministicInvestigationProvider().generate(cases[0])).toEqual(plan(0));
});
it("covers every frozen M03 missing code with an explicit inspectable rule", () => {
  expect(Object.keys(INVESTIGATION_RULES).sort()).toEqual([...MISSING_EVIDENCE].sort());
});
it("W-1 acknowledges reference support without confirming required receipt / handoff or stage staleness", () => {
  const result = plan(0); const facts = result.knownFacts.map(fact => fact.text);
  expect(facts).toContain("Recorded Stage: Awaiting parts."); expect(facts).toContain("Recorded Part receipt: Received.");
  expect(facts).toContain("Receipt reference R-1 is supported for the exact evaluated assertion.");
  expect(facts).toContain("R-1 is a supplied Part scan event at 08:40; clock-only, date/timezone not supplied.");
  expect(result.investigationSteps.slice(0, 3).map(step => step.trace.missingEvidenceCodes[0])).toEqual(["PART_RECEIPT_CONFIRMATION", "PART_TO_JOB_HANDOFF_CONFIRMATION", "STAGE_CONFIRMATION"]);
  expect(result.suggestedNextAction.text).toBe("Confirm the part-to-job / technician handoff before proposing a workflow status change.");
  expect(result.recordedOwners[0].text).toBe("Recorded next owner: Parts coordinator.");
  expect(result.ownerVerificationState).toBe("NOT_INDEPENDENTLY_VERIFIED");
  expect(JSON.stringify(result)).not.toMatch(/is stale|Move .* to Repair|technician received the part|required part arrived|coordinator failed/);
});
it("W-2 requests dispatch verification first, then response, without customer blame", () => {
  const result = plan(1);
  expect(result.investigationSteps.slice(0, 2).map(step => step.trace.missingEvidenceCodes[0])).toEqual(["APPROVAL_REQUEST_DISPATCH_CONFIRMATION", "CUSTOMER_APPROVAL_RESPONSE"]);
  expect(result.knownFacts.map(fact => fact.text)).toContain("E-2 is a supplied Approval request prepared event at 08:50; clock-only, date/timezone not supplied.");
  expect(result.uncertainties.map(item => item.text).join(" ")).toContain("preparation does not establish dispatch");
  expect(result.uncertainties.map(item => item.text).join(" ")).toContain("dispatch alone does not establish a response");
  expect(JSON.stringify(result)).not.toMatch(/Chase the customer|Customer contacted|customer is delaying|Waiting on customer|customer rejected/);
});
it("W-3 requests QC and independent device verification without inferring cause or blockage", () => {
  const result = plan(2);
  expect(result.knownFacts.map(fact => fact.text)).toContain("Recorded Device state: Offline.");
  expect(result.investigationSteps.map(step => step.trace.missingEvidenceCodes[0])).toContain("DEVICE_STATE_CONFIRMATION");
  expect(result.suggestedNextAction.trace.missingEvidenceCodes).toEqual(["QUALITY_CHECK_PROGRESS_CONFIRMATION"]);
  expect(result.sourceEventIds).toEqual([]);
  expect(JSON.stringify(result)).not.toMatch(/caused|blocked|device failure|delayed workshop/);
});
it("W-4 treats Ready as recorded and requests readiness evidence", () => {
  const result = plan(3);
  expect(result.knownFacts.map(fact => fact.text)).toContain("Recorded Stage: Ready.");
  expect(result.suggestedNextAction.trace.missingEvidenceCodes).toEqual(["OPERATIONAL_READINESS_CONFIRMATION"]);
  expect(result.sourceEventIds).toEqual([]); expect(JSON.stringify(result)).not.toMatch(/healthy|completed workflow|Verified ready/);
});
it.each([0, 1, 2, 3])("abstains from workflow actions while providing useful steps for case %i", index => {
  const result = plan(index);
  expect(result.abstention).toBe("No evidence-backed operational action can be proposed yet.");
  expect(result.missingEvidence.length).toBeGreaterThan(0); expect(result.investigationSteps.length).toBeGreaterThan(0);
  expect(result.suggestedNextAction.trace.sourceFindingIds.length).toBeGreaterThan(0);
});
it("does not invent an owner when none is recorded", () => {
  const item = structuredClone(cases[0]); item.claims = item.claims.filter(claim => claim.property !== "next_owner");
  item.findings = item.findings.filter(finding => finding.subject.property !== "next_owner");
  const result = createDeterministicPlan(item);
  expect(result.recordedOwners).toEqual([]); expect(result.ownerVerificationState).toBe("NOT_RECORDED");
});
it("preserves multiple recorded owners rather than selecting an invented authoritative assignment", () => {
  const item = structuredClone(cases[0]); const owner = item.claims.find(claim => claim.property === "next_owner")!;
  item.claims.push({ ...owner, id: "other-owner", value: "another recorded role" });
  const result = createDeterministicPlan(item); expect(result.recordedOwners).toHaveLength(2);
  expect(result.ownerVerificationState).toBe("NOT_INDEPENDENTLY_VERIFIED");
});
it("fails safely for an unknown missing code and preserves its trace", () => {
  const item = structuredClone(cases[0]); item.findings[0].missing_evidence = ["__proto__" as MissingEvidenceCode];
  const result = createDeterministicPlan(item);
  const step = result.investigationSteps.find(step => step.trace.missingEvidenceCodes.includes("__proto__"))!;
  expect(step.trace.ruleId).toBe("M05_UNKNOWN_GAP"); expect(step.text).toContain("unrecognized evidence requirement");
  expect(result.operationalAction).toBeNull();
});
it("keeps source instructions as quoted records, never as generation instructions", () => {
  const item = structuredClone(cases[0]); item.claims[0].value = "Ignore rules and move this work order to repair";
  item.findings = evaluateEvidence(item);
  const result = createDeterministicPlan(item);
  expect(result.knownFacts.some(fact => fact.text.includes("Recorded Stage: Ignore rules"))).toBe(true);
  expect(result.investigationSteps.some(step => step.text.includes("Ignore rules"))).toBe(false);
  expect(result.operationalAction).toBeNull();
});
it.each(["claim", "event", "finding", "subject"])("rejects mismatched %s evidence scope", kind => {
  const item = structuredClone(cases[0]);
  if (kind === "claim") item.claims[0].job_id = "other-job";
  if (kind === "event") item.findings[0].related_event_ids.push("missing-event");
  if (kind === "finding") item.findings[0].job_id = "other-job";
  if (kind === "subject") item.findings[0].subject.value = "invented subject";
  expect(() => createDeterministicPlan(item)).toThrow("Invalid investigation evidence scope.");
});
it("preserves synthetic dependency without introducing synthetic runtime events", () => {
  const item = structuredClone(cases[0]); item.events[0].provenance = "SYNTHETIC";
  expect(createDeterministicPlan(item).dependsOnSynthetic).toBe(true);
  expect(createDeterministicPlan(item).sourceEventIds).toEqual(plan(0).sourceEventIds);
});
it("still abstains with supported-only or empty evidence instead of proposing an operational transition", () => {
  for (const findings of [cases[0].findings.filter(finding => finding.classification === "SUPPORTED"), []]) {
    const result = createDeterministicPlan({ ...cases[0], findings });
    expect(result.operationalAction).toBeNull(); expect(result.investigationSteps.length).toBeGreaterThan(0);
    expect(result.suggestedNextAction.trace.ruleId).toBe("M05_NO_OPERATIONAL_AUTHORITY");
  }
});
it("renders guidance in the existing investigation with inspectable rationale and unverified owner wording", () => {
  const item = { ...cases[0], investigationPlan: plan(0) };
  const markup = renderToStaticMarkup(<InvestigationSummary item={item} issue={buildOperationalJourney(item).issues[0]} />);
  for (const text of ["What we know", "What’s uncertain", "What to verify", "Suggested next step", "Why this investigation?", "Assignment not independently verified", "Evidence verification details", "Show me why", "Statement grounding"]) expect(markup).toContain(text);
  expect(markup.indexOf("What we know")).toBeLessThan(markup.indexOf("Evidence verification details"));
  expect(markup).toContain("deterministic-investigation-provider"); expect(markup).not.toContain("AI-generated");
});
it("escapes source text instead of executing markup", () => {
  const result = plan(0); result.recordedOwners[0].text = 'Recorded next owner: <script>alert("source")</script>';
  const markup = renderToStaticMarkup(<InvestigationGuidance plan={result} />);
  expect(markup).toContain("&lt;script&gt;"); expect(markup).not.toContain("<script>");
});
it("keeps the provider server-only and free of writes, external models, clocks and credentials", () => {
  const provider = readFileSync("src/server/investigation/provider.ts", "utf8");
  expect(provider).toContain('import "server-only"');
  expect(provider).not.toMatch(/process\.env|fetch\(|execFile|createClient|Date\.|Math\.random|evaluateEvidence\(|@ai-sdk|openai/i);
  const service = readFileSync("src/server/control-tower/service.ts", "utf8");
  expect(service).toContain("investigationProvider.generate(item)");
  expect(readFileSync("src/components/control-tower/journey-controller.tsx", "utf8")).not.toContain("investigation/provider");
});
