import { connection } from "next/server";
import { AppShell } from "@/components/control-tower/shell";
import { NovaApp } from "@/components/control-tower/nova-app";
import { DataState } from "@/components/control-tower/states";
import { loadControlTower } from "@/server/control-tower/service";
import { WorkshopReadError } from "@/server/control-tower/loader";
import type { TowerView } from "@/presentation/control-tower";

export const runtime = "nodejs";

const single = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

export default async function Home({ searchParams }: PageProps<"/">) {
  await connection();
  const params = await searchParams;
  const rawView = single(params.view);
  const view = ["cases", "evidence", "knowledge", "simulation"].includes(rawView) ? rawView : "tower";
  let data: TowerView | undefined;
  let configuration = false;

  try {
    data = await loadControlTower();
  } catch (error) {
    configuration = error instanceof WorkshopReadError && error.code === "ACCESS_CONFIGURATION";
  }

  if (!data) {
    return (
      <AppShell view={view} status="error">
        <DataState kind="error" configuration={configuration} />
      </AppShell>
    );
  }

  if (!data.jobs) {
    return (
      <AppShell view={view}>
        <DataState kind="empty" />
      </AppShell>
    );
  }

  return (
    <NovaApp
      data={data}
      initialView={view}
      initialSelected={single(params.case)}
      initialState={
        ["INSUFFICIENT_EVIDENCE", "CONFLICTING_EVIDENCE"].includes(single(params.state))
          ? single(params.state)
          : ""
      }
      initialQuery={single(params.q).slice(0, 200)}
    />
  );
}
