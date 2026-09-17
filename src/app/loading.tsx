import { AppShell } from "@/components/control-tower/shell";
export default function Loading() {
  return <AppShell status="loading"><div className="loading-content" aria-busy="true" role="status"><h1>Loading workshop records</h1><p>Reading source records and evaluating the evidence.</p><div className="loading-metrics" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <div className="skeleton" key={i} />)}</div><div className="loading-workbench" aria-hidden="true"><div className="skeleton" /><div className="skeleton" /></div></div></AppShell>;
}
