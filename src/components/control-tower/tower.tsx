import Link from "next/link";
import { sentenceCase, type TowerView } from "@/presentation/control-tower";
import { CaseDetail } from "./case-detail";
import { AttentionBadge } from "./badges";
import { Icon } from "./icons";

export type TowerFilters = { selected?: string; query: string; state: string; view: string };
export function ControlTower({ data, filters }: { data: TowerView; filters: TowerFilters }) {
  const cases = data.cases.filter(item => (!filters.query || [item.job.external_id, ...item.stages, ...item.owners].join(" ").toLowerCase().includes(filters.query.toLowerCase())) &&
    (!filters.state || item.findings.some(finding => finding.classification === filters.state)));
  const selected = cases.find(item => item.job.id === filters.selected) ?? cases[0];
  const href = (changes: Partial<TowerFilters>) => {
    const next = { ...filters, ...changes };
    const params = new URLSearchParams();
    if (next.view !== "tower") params.set("view", next.view);
    if (next.query) params.set("q", next.query);
    if (next.state) params.set("state", next.state);
    if (next.selected) params.set("case", next.selected);
    return "/?" + params.toString();
  };
  return <>
    <div className="page-heading"><div><h1>{filters.view === "evidence" ? "Evidence" : filters.view === "cases" ? "Work Orders" : "Welcome back!"}</h1><p>Here’s what’s happening in your workshop.</p></div><Link className="refresh-button" href={href({})} prefetch={false}><Icon name="refresh" />Refresh records</Link></div>
    <div className="workbench">
      <section className="case-browser" aria-label="Workshop case list"><div className="case-tools"><form className="search-form" role="search"><label className="sr-only" htmlFor="case-search">Search cases by job, recorded stage or owner</label><Icon name="search" /><input id="case-search" name="q" placeholder="Search job, stage or owner" defaultValue={filters.query} /><input type="hidden" name="view" value={filters.view} />{filters.state && <input type="hidden" name="state" value={filters.state} />}<button type="submit" aria-label="Search cases"><Icon name="arrow" /></button></form><div className="case-filters" aria-label="Filter cases by claim evidence"><Link href={href({ state: "", selected: undefined })} prefetch={false} aria-current={!filters.state ? "true" : undefined}>All cases</Link><Link href={href({ state: "INSUFFICIENT_EVIDENCE", selected: undefined })} prefetch={false} aria-current={filters.state === "INSUFFICIENT_EVIDENCE" ? "true" : undefined}>With gaps</Link><Link href={href({ state: "CONFLICTING_EVIDENCE", selected: undefined })} prefetch={false} aria-current={filters.state === "CONFLICTING_EVIDENCE" ? "true" : undefined}>With conflicts</Link></div></div>
      <div className="case-list">{cases.map(item => <Link key={item.job.id} href={href({ selected: item.job.id })} prefetch={false} className={`case-row ${selected?.job.id === item.job.id ? "selected" : ""}`} aria-current={selected?.job.id === item.job.id ? "true" : undefined}><div className="case-row-top"><strong>Work order {item.job.external_id}</strong><AttentionBadge level={item.priority.level} /></div><p>{item.stages.map(sentenceCase).join(" / ") || "Stage not recorded"}</p></Link>)}</div>
      {!cases.length && <div className="filter-empty"><h3>No matching cases</h3><p>Try another search or remove the evidence filter.</p><Link href="/" prefetch={false}>Clear filters</Link></div>}
      <div className="list-footer">{cases.length} of {data.jobs} work orders<span>Select a work order to review.</span></div></section>
      {selected ? <CaseDetail item={selected} evidenceFirst={filters.view === "evidence"} /> : <div className="detail-empty"><Icon name="cases" /><h2>No case selected</h2><p>Matching work orders will appear here.</p></div>}
    </div>
  </>;
}
