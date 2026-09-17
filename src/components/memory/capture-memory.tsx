"use client";

import { useState, useTransition } from "react";
import { captureResolutionMemory } from "@/server/memory/actions";
import type { ResolutionCategory } from "@/domain/resolution-memory";
import { ProvenanceBadge } from "@/components/control-tower/badges";

export function CaptureMemory({
  jobId,
  externalJobId,
  stage,
  missingCodes = [],
  ruleCode,
  decisionId,
}: {
  jobId: string;
  externalJobId: string;
  stage: string;
  missingCodes?: string[];
  ruleCode?: string | null;
  decisionId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [lesson, setLesson] = useState("");
  const [category, setCategory] = useState<ResolutionCategory>(
    missingCodes.includes("PART_TO_JOB_HANDOFF_CONFIRMATION") ? "PARTS_HANDOFF" :
    missingCodes.includes("STAGE_CONFIRMATION") ? "STAGE_VERIFICATION" :
    missingCodes.includes("APPROVAL_REQUEST_DISPATCH_CONFIRMATION") ? "APPROVAL_DISPATCH" : "GENERAL",
  );
  const [validatedBy, setValidatedBy] = useState("Workshop Manager");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await captureResolutionMemory({
        jobId,
        externalJobId,
        stage,
        missingEvidenceCodes: missingCodes,
        ruleCode,
        decisionId,
        category,
        lesson,
        validatedBy,
      });

      if (result.ok) {
        setMessage({ kind: "success", text: "Resolution saved as operational knowledge." });
        setLesson("");
        setOpen(false);
      } else {
        setMessage({ kind: "error", text: result.error });
      }
    });
  };

  return (
    <div className="capture-memory-widget" aria-label="Capture operational knowledge">
      {!open ? (
        <div className="capture-memory-prompt">
          <button
            type="button"
            className="capture-toggle-button"
            onClick={() => setOpen(true)}
          >
            + Capture as operational knowledge
          </button>
          <small>Turn human-validated lessons into reusable workshop memory</small>
        </div>
      ) : (
        <form className="capture-memory-form" onSubmit={handleSubmit}>
          <div className="capture-form-header">
            <h4>Capture operational lesson · Work order {externalJobId}</h4>
            <ProvenanceBadge value="HUMAN_VALIDATED" />
          </div>
          <p className="capture-form-note">
            Recorded operational knowledge informs managers on future similar cases. It never automatically modifies evidence rules or workshop status.
          </p>

          <label htmlFor="memory-lesson">
            Validated operational lesson / rule of thumb:
          </label>
          <textarea
            id="memory-lesson"
            rows={3}
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
            placeholder="e.g. Before treating a parts scan as evidence that the vehicle can progress, verify the part-to-job or technician handoff."
            required
            minLength={5}
            maxLength={1000}
          />

          <div className="capture-form-row">
            <div>
              <label htmlFor="memory-category">Category:</label>
              <select
                id="memory-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ResolutionCategory)}
              >
                <option value="PARTS_HANDOFF">Parts / Handoff verification</option>
                <option value="STAGE_VERIFICATION">Stage verification</option>
                <option value="APPROVAL_DISPATCH">Approval dispatch</option>
                <option value="QUALITY_CHECK">Quality check</option>
                <option value="READINESS">Readiness certification</option>
                <option value="GENERAL">General operational lesson</option>
              </select>
            </div>

            <div>
              <label htmlFor="memory-validator">Validated by:</label>
              <input
                id="memory-validator"
                type="text"
                value={validatedBy}
                onChange={(e) => setValidatedBy(e.target.value)}
                required
                maxLength={200}
              />
            </div>
          </div>

          <div className="capture-form-actions">
            <button
              type="submit"
              className="save-memory-button"
              disabled={isPending || lesson.trim().length < 5}
            >
              {isPending ? "Saving knowledge…" : "Save operational knowledge"}
            </button>
            <button
              type="button"
              className="cancel-memory-button"
              onClick={() => { setOpen(false); setMessage(null); }}
              disabled={isPending}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {message && (
        <p className={`capture-message capture-${message.kind}`}>{message.text}</p>
      )}
    </div>
  );
}

