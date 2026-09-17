import { buildOperationalJourney } from "@/presentation/operational-journey";
import { buildWorkshopPipeline, pipelineDisplay } from "@/presentation/workshop-pipeline";
import type { CaseView } from "@/presentation/control-tower";
import { JourneyController } from "./journey-controller";
import { InvestigationSummary } from "./investigation-summary";
import { ProvenanceBadge } from "./badges";

export function OperationalJourney({ item }: { item: CaseView }) {
  const journey = buildOperationalJourney(item);
  return <section className="operational-journey" aria-label="Operational journey"><div className="journey-heading"><h3>Operational journey</h3><p>Workshop lifecycle · recorded position and evidence</p></div><p className="journey-history-note">Process map, not observed history. Gray stages have no verified completion; blue marks the recorded position.</p>
    <JourneyController key={item.job.id} pipeline={pipelineDisplay(buildWorkshopPipeline(item))} panels={journey.issues.map(issue => ({ id: issue.id, content: <InvestigationSummary item={item} issue={issue} /> }))}
      context={journey.context.length > 0 && <div className="journey-context"><span>Recorded context</span>{journey.context.map((context, index) => <div key={index}><span>{context.label}: <strong>{context.value}</strong></span><ProvenanceBadge value={context.provenance} /></div>)}</div>} />
  </section>;
}
