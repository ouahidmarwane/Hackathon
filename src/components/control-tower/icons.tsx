import type { CSSProperties } from "react";

export type IconName =
  | "tower"
  | "cases"
  | "evidence"
  | "activity"
  | "knowledge"
  | "arrow"
  | "search"
  | "check"
  | "gap"
  | "conflict"
  | "refresh"
  | "pencil"
  | "chevronLeft"
  | "chevronRight"
  | "sidebar"
  | "star"
  | "car"
  | "diagnosis"
  | "parts"
  | "repair"
  | "shield"
  | "flag";

const paths: Record<IconName, string> = {
  tower: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  cases: "M3 7h18v14H3z M8 7V3h8v4 M3 12h18",
  evidence: "M7 3h10l4 4v14H3V3h4 M14 3v5h7 M7 12h10 M7 16h7",
  activity: "M2 12h5l3-8 4 16 3-8h5",
  knowledge: "M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1z M12 5v16",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6",
  check: "M5 12l4 4L19 6",
  gap: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v6 M12 16v1",
  conflict: "M12 3L2 21h20L12 3 M12 9v5 M12 17v1",
  refresh: "M20 7v5h-5 M4 17v-5h5 M5 8a8 8 0 0 1 13-3l2 2 M4 17l2 2a8 8 0 0 0 13-3",
  pencil: "M4 20h4L18 10l-4-4L4 16v4 M13.5 6.5l4 4",
  chevronLeft: "M15 19l-7-7 7-7",
  chevronRight: "M9 5l7 7-7 7",
  sidebar: "M4 4h16v16H4V4zm6 0v16",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  car: "M5 17h14v-5l-2-4H7l-2 4v5zm-2 0h2m14 0h2M7 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z",
  diagnosis: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  parts: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
  repair: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
};

export function Icon({
  name,
  className,
  style,
}: {
  name: IconName;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
