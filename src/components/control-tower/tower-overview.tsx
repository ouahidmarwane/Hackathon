import { sentenceCase, type TowerView } from "@/presentation/control-tower";
import { AttentionBadge } from "./badges";
import { Icon } from "./icons";

export function TowerOverview({
  data,
  onSelectCase,
  onRunPipeline,
}: {
  data: TowerView;
  onSelectCase: (caseId: string) => void;
  onRunPipeline?: () => void;
}) {
  const reviewCases = data.cases.filter(item => item.priority.level === "REVIEW");
  const conflictCases = data.cases.filter(item =>
    item.findings.some(f => f.classification === "CONFLICTING_EVIDENCE")
  );

  return (
    <div className="tower-overview" aria-label="Workshop Control Tower Overview">
      <div className="page-heading">
        <div>
          <h1>Workshop Control Tower</h1>
          <p>Here&apos;s what needs your attention right now.</p>
        </div>
        {onRunPipeline && (
          <button
            type="button"
            className="primary-button run-pipeline-btn"
            onClick={onRunPipeline}
            style={{ background: "#0284c7", color: "white", borderColor: "#0284c7", fontWeight: 700 }}
          >
            <Icon name="star" />
            ▶ Run NOVA Pipeline
          </button>
        )}
      </div>

      <div className="metrics" aria-label="Workshop metrics">
        <div className="metric">
          <span>Total work orders</span>
          <strong>{data.jobs}</strong>
          <span className="metric-note">Evaluated by NOVA</span>
        </div>
        <div className="metric metric-2">
          <span>Requiring review</span>
          <strong>{reviewCases.length}</strong>
          <span className="metric-note">Actionable human review</span>
        </div>
        <div className="metric metric-3">
          <span>Evidence conflicts</span>
          <strong>{conflictCases.length}</strong>
          <span className="metric-note">Contradictory records</span>
        </div>
      </div>

      <section className="attention-section-overview" aria-label="Work orders needing attention">
        <div className="section-heading">
          <h2>Needs your attention</h2>
          <span>Prioritized by operational factors</span>
        </div>

        <div className="attention-grid">
          {data.cases.map(item => {
            const isReview = item.priority.level === "REVIEW";
            const stageLabel = item.stages.length ? item.stages.map(sentenceCase).join(" / ") : "Stage not recorded";
            const ownerLabel = item.owners.length ? item.owners.map(sentenceCase).join(" / ") : "Not assigned";

            return (
              <article
                key={item.job.id}
                className={`attention-card ${isReview ? "level-review" : "level-routine"}`}
              >
                <div className="attention-card-top">
                  <div>
                    <span className="attention-card-eyebrow">Work Order</span>
                    <h3>{item.job.external_id}</h3>
                  </div>
                  <AttentionBadge level={item.priority.level} />
                </div>

                <div className="attention-card-stage">
                  <span className="stage-badge">{stageLabel}</span>
                  <span className="owner-badge">Owner: {ownerLabel}</span>
                </div>

                <p className="attention-card-headline">
                  <strong>{item.priority.headline}</strong>
                </p>

                {item.priority.reasons.length > 0 && (
                  <ul className="attention-card-reasons">
                    {item.priority.reasons.slice(0, 2).map((reason, idx) => (
                      <li key={idx}>
                        <Icon name="gap" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="attention-card-footer">
                  <span className="timing-chip">{item.priority.timing.summary}</span>
                  <button
                    type="button"
                    className="open-case-button"
                    onClick={() => onSelectCase(item.job.id)}
                    aria-label={`Open work order ${item.job.external_id}`}
                  >
                    Open work order
                    <Icon name="arrow" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

