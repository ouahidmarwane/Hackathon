"use client";

import { useState } from "react";
import { missingLabels, propertyLabel, sentenceCase, type TowerView } from "@/presentation/control-tower";
import { ProvenanceBadge } from "./badges";
import { Icon } from "./icons";
import { FindingWhy } from "./finding-why";

export function EvidenceExplorer({ data }: { data: TowerView }) {
  const [filterState, setFilterState] = useState<string>("");
  const [selectedJobId, setSelectedJobId] = useState<string>("");

  // Flatten all claims and findings with their associated jobs
  const allItems = data.cases.flatMap(caseItem =>
    caseItem.claims.map(claim => {
      const finding = caseItem.findings.find(f => f.subject.claim_id === claim.id);
      const events = caseItem.events.filter(e => finding?.related_event_ids.includes(e.id));
      return {
        job: caseItem.job,
        claim,
        finding,
        events,
        caseItem,
      };
    })
  );

  const totalSupported = allItems.filter(i => i.finding?.classification === "SUPPORTED").length;
  const totalGaps = allItems.filter(i => i.finding?.classification === "INSUFFICIENT_EVIDENCE").length;
  const totalConflicts = allItems.filter(i => i.finding?.classification === "CONFLICTING_EVIDENCE").length;

  const filteredItems = allItems.filter(item => {
    if (filterState && item.finding?.classification !== filterState) return false;
    if (selectedJobId && item.job.id !== selectedJobId) return false;
    return true;
  });

  return (
    <div className="evidence-explorer" aria-label="Workshop Evidence Explorer">
      <div className="page-heading">
        <div>
          <h1>Evidence Explorer</h1>
          <p>What the current workshop records actually support.</p>
        </div>
      </div>

      <div className="evidence-stats-row">
        <div className="evidence-stat-card stat-supported">
          <span>Supported</span>
          <strong>{totalSupported}</strong>
          <small>Verified by independent events</small>
        </div>
        <div className="evidence-stat-card stat-gaps">
          <span>Needs verification</span>
          <strong>{totalGaps}</strong>
          <small>Evidence gaps in records</small>
        </div>
        <div className="evidence-stat-card stat-conflicts">
          <span>Conflicting</span>
          <strong>{totalConflicts}</strong>
          <small>Contradictory observations</small>
        </div>
      </div>

      <div className="evidence-toolbar">
        <div className="evidence-filter-tabs" role="tablist" aria-label="Filter evidence by classification">
          <button
            type="button"
            role="tab"
            aria-selected={filterState === ""}
            className={`tab-btn ${filterState === "" ? "active" : ""}`}
            onClick={() => setFilterState("")}
          >
            All evidence ({allItems.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterState === "SUPPORTED"}
            className={`tab-btn ${filterState === "SUPPORTED" ? "active" : ""}`}
            onClick={() => setFilterState("SUPPORTED")}
          >
            Supported ({totalSupported})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterState === "INSUFFICIENT_EVIDENCE"}
            className={`tab-btn ${filterState === "INSUFFICIENT_EVIDENCE" ? "active" : ""}`}
            onClick={() => setFilterState("INSUFFICIENT_EVIDENCE")}
          >
            Needs verification ({totalGaps})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterState === "CONFLICTING_EVIDENCE"}
            className={`tab-btn ${filterState === "CONFLICTING_EVIDENCE" ? "active" : ""}`}
            onClick={() => setFilterState("CONFLICTING_EVIDENCE")}
          >
            Conflicting ({totalConflicts})
          </button>
        </div>

        <div className="job-filter-pills" aria-label="Filter by work order">
          <button
            type="button"
            className={`pill-btn ${selectedJobId === "" ? "active" : ""}`}
            onClick={() => setSelectedJobId("")}
          >
            All work orders
          </button>
          {data.cases.map(c => (
            <button
              key={c.job.id}
              type="button"
              className={`pill-btn ${selectedJobId === c.job.id ? "active" : ""}`}
              onClick={() => setSelectedJobId(c.job.id)}
            >
              {c.job.external_id}
            </button>
          ))}
        </div>
      </div>

      <div className="evidence-list-container">
        {filteredItems.length > 0 ? (
          <div className="evidence-cards-grid">
            {filteredItems.map(({ job, claim, finding, events, caseItem }) => {
              if (!finding) return null;
              const classification = finding.classification;
              const isSupported = classification === "SUPPORTED";
              const isGap = classification === "INSUFFICIENT_EVIDENCE";

              return (
                <article
                  key={`${job.id}-${claim.id}`}
                  className={`evidence-card ${
                    isSupported ? "is-supported" : isGap ? "is-gap" : "is-conflict"
                  }`}
                >
                  <div className="evidence-card-header">
                    <div className="evidence-job-ref">
                      <span className="job-pill">{job.external_id}</span>
                      <span className="property-title">{propertyLabel(claim.property)}</span>
                    </div>
                    <span
                      className={`evidence-state-pill ${
                        isSupported ? "state-supported" : isGap ? "state-gap" : "state-conflict"
                      }`}
                    >
                      {isSupported ? (
                        <>
                          <Icon name="check" /> Supported
                        </>
                      ) : isGap ? (
                        <>
                          <Icon name="gap" /> Needs verification
                        </>
                      ) : (
                        <>
                          <Icon name="conflict" /> Conflicting
                        </>
                      )}
                    </span>
                  </div>

                  <div className="evidence-assertion">
                    <span className="assertion-label">Recorded claim:</span>
                    <strong>{sentenceCase(claim.value)}</strong>
                    <ProvenanceBadge value={claim.provenance} />
                  </div>

                  {events.length > 0 ? (
                    <div className="evidence-events-linked">
                      <span className="linked-label">Associated evidence:</span>
                      <ul>
                        {events.map(event => (
                          <li key={event.id}>
                            <Icon name="evidence" />
                            <span>
                              <b>{event.external_id}</b> · {sentenceCase(event.event_type)} ({event.source})
                            </span>
                            <time>{event.occurred_at_raw ?? "Time not recorded"}</time>
                            <ProvenanceBadge value={event.provenance} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="no-events-note">No independent events recorded for this claim.</p>
                  )}

                  {finding.missing_evidence.length > 0 && (
                    <div className="evidence-missing-box">
                      <span className="missing-title">Missing verification:</span>
                      <ul>
                        {finding.missing_evidence.map(code => (
                          <li key={code}>
                            <Icon name="gap" />
                            <span>{missingLabels[code] ?? code}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <details className="evidence-technical-details">
                    <summary>Technical details &amp; rule traces</summary>
                    <div className="technical-content">
                      <p>
                        <span>Rule code:</span> <code>{finding.rule_code}</code>
                      </p>
                      <p>
                        <span>Engine version:</span> <code>{finding.rule_version}</code>
                      </p>
                      <FindingWhy finding={finding} item={caseItem} />
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="evidence-empty-state">
            {filterState === "CONFLICTING_EVIDENCE" ? (
              <div className="empty-conflicts-message">
                <Icon name="check" />
                <h3>No conflicting evidence detected</h3>
                <p>
                  All recorded claims either have supporting evidence or identified verification gaps. None have
                  contradictory evidence in the current records.
                </p>
              </div>
            ) : (
              <div className="empty-generic-message">
                <Icon name="evidence" />
                <h3>No matching evidence</h3>
                <p>Try selecting another filter or work order.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
