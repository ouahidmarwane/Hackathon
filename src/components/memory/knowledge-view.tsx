import Link from "next/link";
import { Icon } from "@/components/control-tower/icons";
import { ProvenanceBadge } from "@/components/control-tower/badges";
import type { ResolutionMemory } from "@/domain/resolution-memory";

export function KnowledgeView({ memories }: { memories: ResolutionMemory[] }) {
  return (
    <div className="knowledge-view" aria-label="Organizational memory view">
      <div className="page-heading">
        <div>
          <h1>Workshop Knowledge</h1>
          <p>Lessons from your workshop, validated by people.</p>
        </div>
        <Link className="refresh-button" href="/?view=knowledge" prefetch={false}>
          <Icon name="refresh" />
          Refresh memory
        </Link>
      </div>

      <div className="knowledge-banner">
        <div className="knowledge-banner-content">
          <Icon name="knowledge" />
          <div>
            <strong>Human-Validated Operational Knowledge</strong>
            <p>
              When workshop managers review investigations and record resolutions, those lessons are preserved as operational memory.
              Future similar cases recall these resolutions to inform decisions. Memory informs the manager—it never automatically overrides evidence, modifies rules, or alters workshop status.
            </p>
          </div>
        </div>
      </div>

      <div className="knowledge-stats-row">
        <div className="knowledge-stat-card">
          <span>Captured memories</span>
          <strong>{memories.length}</strong>
        </div>
        <div className="knowledge-stat-card">
          <span>Provenance</span>
          <strong>HUMAN_VALIDATED</strong>
        </div>
        <div className="knowledge-stat-card">
          <span>Storage</span>
          <strong>Append-only Supabase</strong>
        </div>
      </div>

      <section className="knowledge-list-section">
        <div className="section-heading">
          <h3>Stored operational lessons ({memories.length})</h3>
          <span>Immutable audit record</span>
        </div>

        {memories.length > 0 ? (
          <div className="knowledge-grid">
            {memories.map((memory) => (
              <article key={memory.id} className="knowledge-card">
                <div className="knowledge-card-header">
                  <div className="knowledge-source-info">
                    <span className="knowledge-job-tag">Case {memory.externalJobId}</span>
                    {memory.stage && <span className="knowledge-stage-tag">{memory.stage}</span>}
                  </div>
                  <div className="knowledge-card-badges">
                    <span className="memory-category-tag">{memory.category.replace(/_/g, " ")}</span>
                    <ProvenanceBadge value={memory.provenance} />
                  </div>
                </div>

                <blockquote className="knowledge-lesson">
                  “{memory.lesson}”
                </blockquote>

                {memory.missingEvidenceCodes.length > 0 && (
                  <div className="knowledge-gaps-row">
                    <span className="gaps-label">Associated gaps:</span>
                    <div className="gaps-tags">
                      {memory.missingEvidenceCodes.map((code) => (
                        <code key={code} className="gap-code-tag">{code}</code>
                      ))}
                    </div>
                  </div>
                )}

                <div className="knowledge-card-footer">
                  <span>Validated by: <strong>{memory.validatedBy}</strong></span>
                  <time dateTime={memory.createdAt}>
                    {new Date(memory.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </time>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="knowledge-empty-state">
            <Icon name="knowledge" />
            <h3>No operational memories recorded yet</h3>
            <p>
              When managers investigate cases and record human resolutions, lessons will be captured here.
            </p>
            <Link href="/" className="back-link">Return to Control Tower</Link>
          </div>
        )}
      </section>
    </div>
  );
}

