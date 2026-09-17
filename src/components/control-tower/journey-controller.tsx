"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PipelineDisplay } from "@/presentation/workshop-pipeline";
import type { JourneyDisplayNode } from "@/presentation/operational-journey";
import { ProvenanceBadge } from "./badges";
import { Icon, type IconName } from "./icons";

export function JourneyController({ pipeline, panels, context }: { pipeline: PipelineDisplay; panels: { id: string; content: ReactNode }[]; context?: ReactNode }) {
  const stageIcons: Record<string, IconName> = { reception: "car", diagnosis: "diagnosis", "parts-approval": "parts", repair: "repair", "quality-check": "shield", ready: "flag", collection: "car" };
  const [active, setActive] = useState<string>();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const groups = [...pipeline.stages, pipeline.unplaced];
  const selectedGroup = groups.find(group => group.issues.some(issue => issue.id === active));
  const current = selectedGroup?.issues.find(issue => issue.id === active);
  const selectedLabel = pipeline.stages.find(stage => stage === selectedGroup)?.label ?? "case evidence";
  useEffect(() => {
    if (active) { panelRef.current?.focus({ preventScroll: true }); panelRef.current?.scrollIntoView({ block: "nearest" }); }
  }, [active]);
  const inspect = (id: string) => {
    if (id === active) { panelRef.current?.focus({ preventScroll: true }); panelRef.current?.scrollIntoView({ block: "nearest" }); }
    else setActive(id);
  };
  const marker = (issues: PipelineDisplay["unplaced"]["issues"], label: string) => {
    if (!issues.length) return null;
    const conflict = issues.some(issue => issue.kind === "CONFLICT");
    const first = issues.find(issue => issue.kind === "CONFLICT") ?? issues[0];
    const count = issues.reduce((sum, issue) => sum + Math.max(1, issue.requirementCount), 0);
    return <button type="button" className={`pipeline-issue ${conflict ? "is-conflict node-conflict" : "is-gap"}`} onClick={event => { triggerRef.current = event.currentTarget; inspect(first.id); }} aria-label={`${label}: ${conflict ? "conflicting evidence" : "verification gaps"}. Investigate`} aria-expanded={selectedGroup?.issues.some(issue => issues.includes(issue)) ?? false} aria-controls={first.id + "-panel"}><Icon name={conflict ? "conflict" : "gap"} /><span>{count} {conflict ? "evidence issues" : "verification gaps"}</span><span className="pipeline-issue-caption">{first.title} · {conflict ? "Incompatible evidence" : "Not confirmed"}</span><span className="pipeline-investigate">Investigate<Icon name="arrow" /></span></button>;
  };
  const observation = (node: JourneyDisplayNode) => <div className="pipeline-observation" key={node.id}><span className="attachment-label">Observed event</span><strong>{node.event_ref} · {node.title}</strong><span className="pipeline-clock">{node.time_raw ?? "Time not supplied"}</span><small>{node.temporal_note}</small><ProvenanceBadge value={node.provenance} />{node.support_labels?.map(label => <span className="pipeline-support" key={label}><Icon name="check" />{label}</span>)}</div>;
  const hasEvents = groups.some(group => group.events.length);
  const hasIssues = groups.some(group => group.issues.length);
  return <>
    <ol className="workshop-pipeline" aria-label="Workshop lifecycle process map">{pipeline.stages.map(stage => <li key={stage.id} className={`process-stage ${stage.recorded.length ? "recorded-position" : "position-unverified"}`} data-stage={stage.id}>
      <span className="process-stage-label">{stage.label}</span><span className="process-node" aria-hidden="true"><Icon name={stageIcons[stage.id] || "cases"} /></span>
      <span className="process-position-label">{stage.recorded.length ? "Recorded position" : "Process stage · unverified"}</span>
      {stage.recorded.map(node => <div className="pipeline-recorded" key={node.id}><strong>{node.title}</strong><ProvenanceBadge value={node.provenance} /></div>)}
      {stage.events.length > 0 && <details className="stage-evidence"><summary>{stage.events.length} recorded events</summary>{stage.events.map(observation)}</details>}
      {marker(stage.issues, stage.label)}
    </li>)}</ol>
    <details className="journey-supporting"><summary>More checks &amp; recorded context</summary>
    <div className="pipeline-legend" aria-label="Pipeline legend"><span><i className="legend-process" />Process stage · unverified</span><span><i className="legend-position" />Recorded position</span><span><Icon name="check" />Exact supported relationship</span><span><Icon name="gap" />Evidence gap</span><span><Icon name="conflict" />Conflicting evidence</span></div>
    {!hasEvents && <p className="journey-no-events"><Icon name="evidence" />No independent event recorded for this work order.</p>}
    {(pipeline.unplaced.recorded.length > 0 || pipeline.unplaced.events.length > 0 || pipeline.unplaced.issues.length > 0) && <div className="pipeline-unplaced"><span>Other recorded context / verification</span>{pipeline.unplaced.recorded.map(node => <span key={node.id}>{node.title} <ProvenanceBadge value={node.provenance} /></span>)}{pipeline.unplaced.events.map(observation)}{marker(pipeline.unplaced.issues, "Other case evidence")}</div>}
    {context}
    </details>
    <div ref={panelRef} tabIndex={-1} hidden={!current} className="selected-investigation" aria-label={current ? `${current.title} evidence investigation` : "Evidence investigation"}>
      {current && <><div className="investigation-selection"><strong>Investigate {selectedLabel}</strong><button type="button" onClick={() => { setActive(undefined); triggerRef.current?.focus(); }}>Close investigation</button></div>{selectedGroup!.issues.length > 1 && <div className="investigation-options" aria-label="Related verification issues">{selectedGroup!.issues.map(issue => <button type="button" key={issue.id} onClick={() => inspect(issue.id)} aria-pressed={issue.id === active} aria-controls={issue.id + "-panel"}>{issue.title}</button>)}</div>}</>}
      {panels.map(panel => <section key={panel.id} id={panel.id + "-panel"} hidden={panel.id !== active}>{panel.content}</section>)}
    </div>
    {!hasIssues && <p className="journey-no-issues">No gap or conflict returned for the evaluated claims. This is not a job-wide operational diagnosis.</p>}
  </>;
}
