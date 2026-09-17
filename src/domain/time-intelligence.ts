import type { EventRecord } from "./operational-model";

export type TimingState = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";

export type JobTimeIntelligence = {
  state: TimingState;
  summary: string;
  latestEventId: string | null;
  latestEventRef: string | null;
  latestTimeRaw: string | null;
  timeKind: "clock" | "timestamp" | "unknown";
  provenance: string | null;
  durationComputable: false;
  notes: string[];
};

/**
 * Deterministic time intelligence over an immutable snapshot of events.
 * 
 * Strict invariants:
 * 1. Clock-only times (e.g. "08:40") preserve clock representation without inventing dates.
 * 2. Never invents time-in-stage, SLA delays, arrival times, or repair durations.
 * 3. Clearly distinguishes SUPPLIED clock-only observations from SYNTHETIC timestamps.
 */
export function evaluateJobTimeIntelligence(
  jobId: string,
  events: readonly Readonly<EventRecord>[],
): JobTimeIntelligence {
  const jobEvents = events.filter(e => e.job_id === jobId);

  if (jobEvents.length === 0) {
    return {
      state: "UNAVAILABLE",
      summary: "No event timing recorded",
      latestEventId: null,
      latestEventRef: null,
      latestTimeRaw: null,
      timeKind: "unknown",
      provenance: null,
      durationComputable: false,
      notes: ["Not enough evidence to calculate time in stage or elapsed duration."],
    };
  }

  // Find events with timing
  const timedEvents = jobEvents.filter(e => e.time_kind !== "unknown" && e.occurred_at_raw !== null);

  if (timedEvents.length === 0) {
    return {
      state: "UNAVAILABLE",
      summary: "No event timing recorded",
      latestEventId: jobEvents[0]?.id ?? null,
      latestEventRef: jobEvents[0]?.external_id ?? null,
      latestTimeRaw: null,
      timeKind: "unknown",
      provenance: jobEvents[0]?.provenance ?? null,
      durationComputable: false,
      notes: ["Event observed without occurrence time. Duration cannot be calculated."],
    };
  }

  // Check if any full timestamp exists
  const timestampEvents = timedEvents.filter(e => e.time_kind === "timestamp");
  if (timestampEvents.length > 0) {
    // Sort by ISO timestamp
    const latest = [...timestampEvents].sort((a, b) => {
      const ta = a.occurred_at ? Date.parse(a.occurred_at) : 0;
      const tb = b.occurred_at ? Date.parse(b.occurred_at) : 0;
      return tb - ta;
    })[0];

    return {
      state: "AVAILABLE",
      summary: `Latest event at ${latest.occurred_at_raw} (${latest.provenance.toLowerCase()})`,
      latestEventId: latest.id,
      latestEventRef: latest.external_id,
      latestTimeRaw: latest.occurred_at_raw,
      timeKind: "timestamp",
      provenance: latest.provenance,
      durationComputable: false,
      notes: [
        `Timestamp recorded with date and offset (${latest.provenance}).`,
        "Workflow start time not supplied; cannot calculate total time in stage or SLA.",
      ],
    };
  }

  // Clock-only events (e.g. R-1 = 08:40, E-2 = 08:50)
  const clockEvents = timedEvents.filter(e => e.time_kind === "clock");
  const latestClock = clockEvents[clockEvents.length - 1];

  return {
    state: "PARTIAL",
    summary: `Latest supplied event at ${latestClock.occurred_at_raw} (clock-only)`,
    latestEventId: latestClock.id,
    latestEventRef: latestClock.external_id,
    latestTimeRaw: latestClock.occurred_at_raw,
    timeKind: "clock",
    provenance: latestClock.provenance,
    durationComputable: false,
    notes: [
      "Clock-only source evidence; date, timezone, and stage entry time not supplied.",
      "Not enough evidence to calculate duration, delay, or SLA breach.",
    ],
  };
}

