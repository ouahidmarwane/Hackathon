import "server-only";
import { cache } from "react";
import { evaluateEvidence } from "@/domain/evidence-engine";
import type { HumanDecision } from "@/domain/human-decision";
import { buildTowerView } from "@/presentation/control-tower";
import { loadOperationalWorkspace } from "./loader";
import { DeterministicInvestigationProvider } from "@/server/investigation/provider";

import { evaluateCasePriority } from "@/domain/prioritization";
import { recallRelevantMemories } from "@/domain/resolution-memory";

const investigationProvider = new DeterministicInvestigationProvider();

export const loadControlTower = cache(async () => {
  const workspace = await loadOperationalWorkspace();
  const view = buildTowerView(workspace.snapshot, evaluateEvidence(workspace.snapshot));
  view.memories = workspace.memories;
  const decisionsByJob = new Map<string, HumanDecision[]>();
  for (const decision of workspace.decisions) {
    const list = decisionsByJob.get(decision.jobId) ?? [];
    list.push(decision);
    decisionsByJob.set(decision.jobId, list);
  }
  await Promise.all(view.cases.map(async item => {
    item.investigationPlan = await investigationProvider.generate(item);
    item.decisions = decisionsByJob.get(item.job.id) ?? [];
    item.relatedMemories = recallRelevantMemories(
      {
        jobId: item.job.id,
        stage: item.stages[0],
        missingCodes: item.missing,
        ruleCodes: item.findings.map(f => f.rule_code),
      },
      workspace.memories,
    );
    item.priority = evaluateCasePriority({
      job: item.job,
      claims: item.claims,
      events: item.events,
      findings: item.findings,
      decisions: item.decisions,
      suggestedActionText: item.investigationPlan?.suggestedNextAction?.text,
    });
  }));
  view.cases.sort((a, b) => a.priority.rank - b.priority.rank || a.job.external_id.localeCompare(b.job.external_id));
  return view;
});
