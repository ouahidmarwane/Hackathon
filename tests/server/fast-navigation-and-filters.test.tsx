import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkOrdersView } from "@/components/control-tower/work-orders-view";
import { TowerOverview } from "@/components/control-tower/tower-overview";
import { EvidenceExplorer } from "@/components/control-tower/evidence-explorer";
import { KnowledgeView } from "@/components/memory/knowledge-view";
import { buildTowerView } from "@/presentation/control-tower";
import { normalizeSnapshot } from "@/server/control-tower/loader";
import { evaluateEvidence } from "@/domain/evidence-engine";
import { transformC02 } from "@/server/ingestion/c02";

describe("M10.6 fast navigation, filter semantics, and distinct view responsibilities", () => {
  it("derives filter counts and semantics correctly from M03 findings with zero-conflict empty state", async () => {
    const raw = await transformC02();
    const snapshot = normalizeSnapshot(raw);
    const findings = evaluateEvidence(snapshot);
    const data = buildTowerView(snapshot, findings);

    // All cases (4 in C02)
    const allMarkup = renderToStaticMarkup(
      <WorkOrdersView
        data={data}
        filterState=""
        searchQuery=""
        onSelectCase={vi.fn()}
        onChangeFilter={vi.fn()}
        onChangeSearch={vi.fn()}
      />
    );
    expect(allMarkup).toContain("All cases (4)");
    expect(allMarkup).toContain("With gaps (4)");
    expect(allMarkup).toContain("With conflicts (0)");

    // With conflicts renders proper friendly empty state, NOT generic error or missing cases
    const conflictMarkup = renderToStaticMarkup(
      <WorkOrdersView
        data={data}
        filterState="CONFLICTING_EVIDENCE"
        searchQuery=""
        onSelectCase={vi.fn()}
        onChangeFilter={vi.fn()}
        onChangeSearch={vi.fn()}
      />
    );
    expect(conflictMarkup).toContain("No evidence conflicts detected");
    expect(conflictMarkup).toContain("NOVA hasn&#x27;t found contradictory evidence");
    expect(conflictMarkup).not.toContain("Work order W-1");
  });

  it("composes search and filters locally on presentation data without server reload and operates <100ms", async () => {
    const raw = await transformC02();
    const snapshot = normalizeSnapshot(raw);
    const findings = evaluateEvidence(snapshot);
    const data = buildTowerView(snapshot, findings);

    // Filter switching: All -> Gaps
    const tGaps = performance.now();
    const gapsMarkup = renderToStaticMarkup(
      <WorkOrdersView
        data={data}
        selectedCaseId={data.cases[0].job.id}
        filterState="INSUFFICIENT_EVIDENCE"
        searchQuery=""
        onSelectCase={vi.fn()}
        onChangeFilter={vi.fn()}
        onChangeSearch={vi.fn()}
      />
    );
    const allToGapsTime = performance.now() - tGaps;

    // Filter switching: Gaps -> Conflicts
    const tConflicts = performance.now();
    renderToStaticMarkup(
      <WorkOrdersView
        data={data}
        selectedCaseId={data.cases[0].job.id}
        filterState="CONFLICTING_EVIDENCE"
        searchQuery=""
        onSelectCase={vi.fn()}
        onChangeFilter={vi.fn()}
        onChangeSearch={vi.fn()}
      />
    );
    const gapsToConflictsTime = performance.now() - tConflicts;

    // Search for W-1 with gaps filter
    const tSearch = performance.now();
    const searchMarkup = renderToStaticMarkup(
      <WorkOrdersView
        data={data}
        filterState="INSUFFICIENT_EVIDENCE"
        searchQuery="W-1"
        onSelectCase={vi.fn()}
        onChangeFilter={vi.fn()}
        onChangeSearch={vi.fn()}
      />
    );
    const searchTime = performance.now() - tSearch;

    expect(gapsMarkup).toContain("Work order W-1");
    expect(searchMarkup).toContain("Work order W-1");
    expect(searchMarkup).not.toContain("Work order W-2");
    expect(searchMarkup).not.toContain("Work order W-3");
    expect(searchMarkup).not.toContain("Work order W-4");

    console.log(`[PERF] All -> Gaps: ${allToGapsTime.toFixed(2)} ms`);
    console.log(`[PERF] Gaps -> Conflicts: ${gapsToConflictsTime.toFixed(2)} ms`);
    console.log(`[PERF] Search: ${searchTime.toFixed(2)} ms`);

    expect(allToGapsTime).toBeLessThan(100);
    expect(gapsToConflictsTime).toBeLessThan(100);
    expect(searchTime).toBeLessThan(100);
  });

  it("ensures Control Tower, Work Orders and Evidence fulfill distinct responsibilities and switch <200ms", async () => {
    const raw = await transformC02();
    const snapshot = normalizeSnapshot(raw);
    const findings = evaluateEvidence(snapshot);
    const data = buildTowerView(snapshot, findings);

    // 1. Control tower: compact attention cards, scannable, no full case journey
    const tTower = performance.now();
    const towerMarkup = renderToStaticMarkup(
      <TowerOverview data={data} onSelectCase={vi.fn()} />
    );
    const towerTime = performance.now() - tTower;
    expect(towerMarkup).toContain("Workshop Control Tower");
    expect(towerMarkup).toContain("Needs your attention");
    expect(towerMarkup).toContain("Open work order");
    expect(towerMarkup).not.toContain("workshop-pipeline");
    expect(towerMarkup).not.toContain("Detailed evidence inspector");

    // 2. Work Orders view
    const tCases = performance.now();
    const casesMarkup = renderToStaticMarkup(
      <WorkOrdersView
        data={data}
        selectedCaseId={data.cases[0].job.id}
        filterState=""
        searchQuery=""
        onSelectCase={vi.fn()}
        onChangeFilter={vi.fn()}
        onChangeSearch={vi.fn()}
      />
    );
    const casesTime = performance.now() - tCases;
    expect(casesMarkup).toContain("Work Orders");
    expect(casesMarkup).toContain("NOVA Investigation");

    // 3. Evidence explorer: audit explorer with classification counts and human-readable assertions
    const tEvidence = performance.now();
    const evidenceMarkup = renderToStaticMarkup(
      <EvidenceExplorer data={data} />
    );
    const evidenceTime = performance.now() - tEvidence;
    expect(evidenceMarkup).toContain("Evidence Explorer");
    expect(evidenceMarkup).toContain("What the current workshop records actually support");
    expect(evidenceMarkup).toContain("Supported");
    expect(evidenceMarkup).toContain("Needs verification");
    expect(evidenceMarkup).toContain("Conflicting");
    expect(evidenceMarkup).not.toContain("order-journey");

    // 4. Knowledge view
    const tKnowledge = performance.now();
    renderToStaticMarkup(<KnowledgeView memories={data.memories ?? []} />);
    const knowledgeTime = performance.now() - tKnowledge;

    // 5. Case switching W-1 -> W-2, W-2 -> W-3
    const tW1ToW2 = performance.now();
    renderToStaticMarkup(
      <WorkOrdersView
        data={data}
        selectedCaseId={data.cases[1].job.id}
        filterState=""
        searchQuery=""
        onSelectCase={vi.fn()}
        onChangeFilter={vi.fn()}
        onChangeSearch={vi.fn()}
      />
    );
    const w1ToW2Time = performance.now() - tW1ToW2;

    const tW2ToW3 = performance.now();
    renderToStaticMarkup(
      <WorkOrdersView
        data={data}
        selectedCaseId={data.cases[2].job.id}
        filterState=""
        searchQuery=""
        onSelectCase={vi.fn()}
        onChangeFilter={vi.fn()}
        onChangeSearch={vi.fn()}
      />
    );
    const w2ToW3Time = performance.now() - tW2ToW3;

    console.log(`[PERF] Control Tower -> Work Orders: ${casesTime.toFixed(2)} ms`);
    console.log(`[PERF] Work Orders -> Evidence: ${evidenceTime.toFixed(2)} ms`);
    console.log(`[PERF] Evidence -> Knowledge: ${knowledgeTime.toFixed(2)} ms`);
    console.log(`[PERF] Knowledge -> Control Tower: ${towerTime.toFixed(2)} ms`);
    console.log(`[PERF] W-1 -> W-2: ${w1ToW2Time.toFixed(2)} ms`);
    console.log(`[PERF] W-2 -> W-3: ${w2ToW3Time.toFixed(2)} ms`);

    expect(casesTime).toBeLessThan(200);
    expect(evidenceTime).toBeLessThan(200);
    expect(knowledgeTime).toBeLessThan(200);
    expect(towerTime).toBeLessThan(200);
    expect(w1ToW2Time).toBeLessThan(200);
    expect(w2ToW3Time).toBeLessThan(200);
  });
});
