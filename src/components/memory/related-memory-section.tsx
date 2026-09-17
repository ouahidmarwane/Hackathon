import { Icon } from "@/components/control-tower/icons";
import { ProvenanceBadge } from "@/components/control-tower/badges";
import type { MemoryRecallMatch } from "@/domain/resolution-memory";

export function RelatedMemorySection({ matches }: { matches: MemoryRecallMatch[] }) {
  return (
    <section className="detail-section related-memory-section" aria-label="Organizational memory">
      <div className="section-heading">
        <div className="memory-heading-left">
          <Icon name="knowledge" />
          <h3>Related knowledge</h3>
        </div>
        <span>{matches.length} {matches.length === 1 ? "previous resolution" : "previous resolutions"} recalled</span>
      </div>

      <p className="memory-disclaimer">
        Historical context from past human decisions. <strong>Memory never overrides current evidence or alters workshop status.</strong>
      </p>

      {matches.length > 0 ? (
        <div className="memory-cards-list">
          {matches.filter(match => match.memory.provenance === "HUMAN_VALIDATED").slice(0, 1).map(({ memory, relevanceReason }) => (
            <article key={memory.id} className="memory-card">
              <div className="memory-card-header">
                <div className="memory-card-source">
                  <span className="source-label">From past case:</span>
                  <strong>Work order {memory.externalJobId}</strong>
                  {memory.stage && <span className="source-stage">({memory.stage})</span>}
                </div>
                <div className="memory-card-badges">
                  <span className="memory-category-tag">{memory.category.replace(/_/g, " ")}</span>
                  <ProvenanceBadge value={memory.provenance} />
                </div>
              </div>

              <blockquote className="memory-card-lesson">
                “{memory.lesson}”
              </blockquote>

              <details className="memory-card-relevance"><summary>Why this memory?</summary><div>
                <Icon name="evidence" />
                <span><strong>Why this memory:</strong> {relevanceReason}</span>
              </div></details>

              <div className="memory-card-footer">
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
        <div className="memory-empty-state">
          <p>No related validated knowledge yet.</p>
          <small>Validated human decisions and captured lessons will be surfaced here when similar evidence gaps occur.</small>
        </div>
      )}
    </section>
  );
}

