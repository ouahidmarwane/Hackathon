"use client";

import { useMemo } from "react";
import { sentenceCase, type TowerView } from "@/presentation/control-tower";
import { CaseDetail } from "./case-detail";
import { AttentionBadge } from "./badges";
import { Icon } from "./icons";

export function WorkOrdersView({
  data,
  selectedCaseId,
  filterState,
  searchQuery,
  onSelectCase,
  onChangeFilter,
  onChangeSearch,
  onRefresh,
}: {
  data: TowerView;
  selectedCaseId?: string;
  filterState: string;
  searchQuery: string;
  onSelectCase: (caseId: string) => void;
  onChangeFilter: (state: string) => void;
  onChangeSearch: (q: string) => void;
  onRefresh?: () => void;
}) {
  // Counts dynamically derived from actual M03 findings
  const allCount = data.cases.length;
  const gapCount = useMemo(
    () => data.cases.filter(c => c.findings.some(f => f.classification === "INSUFFICIENT_EVIDENCE")).length,
    [data.cases]
  );
  const conflictCount = useMemo(
    () => data.cases.filter(c => c.findings.some(f => f.classification === "CONFLICTING_EVIDENCE")).length,
    [data.cases]
  );

  // Filtered cases matching both search query and evidence filter
  const filteredCases = useMemo(() => {
    return data.cases.filter(item => {
      // Search matching: job external_id, stages, owners
      if (searchQuery.trim()) {
        const needle = searchQuery.toLowerCase().trim();
        const haystack = [item.job.external_id, ...item.stages, ...item.owners].join(" ").toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      // Evidence state matching
      if (filterState === "INSUFFICIENT_EVIDENCE") {
        return item.findings.some(f => f.classification === "INSUFFICIENT_EVIDENCE");
      }
      if (filterState === "CONFLICTING_EVIDENCE") {
        return item.findings.some(f => f.classification === "CONFLICTING_EVIDENCE");
      }
      return true;
    });
  }, [data.cases, searchQuery, filterState]);

  // Selected case
  const selected = useMemo(() => {
    if (selectedCaseId) {
      const match = filteredCases.find(c => c.job.id === selectedCaseId || c.job.external_id === selectedCaseId);
      if (match) return match;
    }
    return filteredCases[0] ?? (filteredCases.length === 0 ? null : data.cases[0]);
  }, [selectedCaseId, filteredCases, data.cases]);

  return (
    <div className="work-orders-view" aria-label="Work Orders View">
      <div className="page-heading">
        <div>
          <h1>Work Orders</h1>
          <p>Primary operational case workspace &amp; investigation details.</p>
        </div>
        {onRefresh && (
          <button type="button" className="refresh-button" onClick={onRefresh}>
            <Icon name="refresh" />
            Refresh records
          </button>
        )}
      </div>

      <div className="workbench">
        <section className="case-browser" aria-label="Workshop case list">
          <div className="case-tools">
            <form
              className="search-form"
              role="search"
              onSubmit={e => {
                e.preventDefault();
              }}
            >
              <label className="sr-only" htmlFor="case-search">
                Search cases by job, recorded stage or owner
              </label>
              <Icon name="search" />
              <input
                id="case-search"
                name="q"
                placeholder="Search job, stage or owner"
                value={searchQuery}
                onChange={e => onChangeSearch(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onChangeSearch("")}
                  aria-label="Clear search"
                  className="clear-search-btn"
                >
                  ✕
                </button>
              )}
            </form>

            <div className="case-filters" role="tablist" aria-label="Filter cases by evidence state">
              <button
                type="button"
                role="tab"
                aria-selected={filterState === ""}
                className={`filter-tab-btn ${filterState === "" ? "active" : ""}`}
                onClick={() => onChangeFilter("")}
              >
                All cases ({allCount})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filterState === "INSUFFICIENT_EVIDENCE"}
                className={`filter-tab-btn ${filterState === "INSUFFICIENT_EVIDENCE" ? "active" : ""}`}
                onClick={() => onChangeFilter("INSUFFICIENT_EVIDENCE")}
              >
                With gaps ({gapCount})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filterState === "CONFLICTING_EVIDENCE"}
                className={`filter-tab-btn ${filterState === "CONFLICTING_EVIDENCE" ? "active" : ""}`}
                onClick={() => onChangeFilter("CONFLICTING_EVIDENCE")}
              >
                With conflicts ({conflictCount})
              </button>
            </div>
          </div>

          <div className="case-list">
            {filteredCases.map(item => (
              <button
                key={item.job.id}
                type="button"
                onClick={() => onSelectCase(item.job.id)}
                className={`case-row ${selected?.job.id === item.job.id ? "selected" : ""}`}
                aria-current={selected?.job.id === item.job.id ? "true" : undefined}
              >
                <div className="case-row-top">
                  <strong>Work order {item.job.external_id}</strong>
                  <AttentionBadge level={item.priority.level} />
                </div>
                <p>{item.stages.map(sentenceCase).join(" / ") || "Stage not recorded"}</p>
                <span className="case-row-owner">
                  Owner: {item.owners.map(sentenceCase).join(" / ") || "Not assigned"}
                </span>
              </button>
            ))}
          </div>

          {filteredCases.length === 0 && (
            <div className="filter-empty">
              {filterState === "CONFLICTING_EVIDENCE" ? (
                <div className="conflicts-empty-box">
                  <Icon name="check" />
                  <h3>No evidence conflicts detected</h3>
                  <p>NOVA hasn&apos;t found contradictory evidence in the current records.</p>
                </div>
              ) : (
                <div className="generic-empty-box">
                  <Icon name="search" />
                  <h3>No matching work orders</h3>
                  <p>Try clearing your search or removing the evidence filter.</p>
                  <button
                    type="button"
                    className="clear-filters-btn"
                    onClick={() => {
                      onChangeFilter("");
                      onChangeSearch("");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="list-footer">
            {filteredCases.length} of {allCount} work orders
            <span>Select a work order to review.</span>
          </div>
        </section>

        {selected ? (
          <CaseDetail item={selected} />
        ) : (
          <div className="detail-empty">
            <Icon name="cases" />
            <h2>No work order selected</h2>
            <p>Matching work orders will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

