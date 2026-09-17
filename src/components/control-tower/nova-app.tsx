"use client";

import { useEffect, useState } from "react";
import type { TowerView } from "@/presentation/control-tower";
import { AppShell } from "./shell";
import { TowerOverview } from "./tower-overview";
import { WorkOrdersView } from "./work-orders-view";
import { EvidenceExplorer } from "./evidence-explorer";
import { KnowledgeView } from "@/components/memory/knowledge-view";
import { NovaPipeline } from "@/components/simulator/nova-pipeline";

export function NovaApp({
  data,
  initialView = "tower",
  initialSelected = "",
  initialState = "",
  initialQuery = "",
}: {
  data: TowerView;
  initialView?: string;
  initialSelected?: string;
  initialState?: string;
  initialQuery?: string;
}) {
  const [view, setView] = useState<string>(initialView);
  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    initialSelected || (data.cases[0]?.job.id ?? "")
  );
  const [caseFilter, setCaseFilter] = useState<string>(initialState);
  const [searchQuery, setSearchQuery] = useState<string>(initialQuery);

  // Sync state with URL without server reload
  const updateUrl = (
    nextView: string,
    nextSelected?: string,
    nextFilter?: string,
    nextQuery?: string
  ) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (nextView !== "tower") params.set("view", nextView);
    if (nextSelected) params.set("case", nextSelected);
    if (nextFilter) params.set("state", nextFilter);
    if (nextQuery) params.set("q", nextQuery);

    const qs = params.toString();
    const newUrl = qs ? `/?${qs}` : "/";
    window.history.pushState(null, "", newUrl);
  };

  // Listen to popstate for browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const rawView = params.get("view") ?? "tower";
      const validView = ["cases", "evidence", "knowledge", "simulation"].includes(rawView) ? rawView : "tower";
      setView(validView);
      const c = params.get("case") ?? "";
      if (c) setSelectedCaseId(c);
      setCaseFilter(params.get("state") ?? "");
      setSearchQuery(params.get("q") ?? "");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleNavigate = (targetView: string) => {
    setView(targetView);
    updateUrl(targetView, view === "cases" ? selectedCaseId : undefined, caseFilter, searchQuery);
  };

  const handleSelectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    if (view !== "cases") {
      setView("cases");
      updateUrl("cases", caseId, caseFilter, searchQuery);
    } else {
      updateUrl("cases", caseId, caseFilter, searchQuery);
    }
  };

  const handleChangeFilter = (state: string) => {
    setCaseFilter(state);
    updateUrl(view, selectedCaseId, state, searchQuery);
  };

  const handleChangeSearch = (q: string) => {
    setSearchQuery(q);
    updateUrl(view, selectedCaseId, caseFilter, q);
  };

  const handleRefresh = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const handleRunPipeline = () => {
    setView("simulation");
    updateUrl("simulation", undefined, caseFilter, searchQuery);
  };

  return (
    <AppShell view={view} onNavigate={handleNavigate} status="loaded">
      {view === "tower" && <TowerOverview data={data} onSelectCase={handleSelectCase} onRunPipeline={handleRunPipeline} />}
      {view === "cases" && (
        <WorkOrdersView
          data={data}
          selectedCaseId={selectedCaseId}
          filterState={caseFilter}
          searchQuery={searchQuery}
          onSelectCase={handleSelectCase}
          onChangeFilter={handleChangeFilter}
          onChangeSearch={handleChangeSearch}
          onRefresh={handleRefresh}
        />
      )}
      {view === "evidence" && <EvidenceExplorer data={data} />}
      {view === "knowledge" && <KnowledgeView memories={data.memories ?? []} />}
      {view === "simulation" && <NovaPipeline />}
    </AppShell>
  );
}

