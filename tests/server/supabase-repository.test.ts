import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { SupabaseOperationalRepository } from "@/server/ingestion/supabase-repository";
import { transformC02 } from "@/server/ingestion/c02";

// Exercise the real Supabase/PostgREST client against an in-process HTTP stub.
// No fetch request reaches a network or project.
function repositoryWithResponses(responses: Response[]) {
  const fetch = vi.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request");
    return response;
  });
  const client = createClient("http://localhost:54321", "sb_publishable_test", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch },
  });
  return { repository: new SupabaseOperationalRepository(client), fetch };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});

describe("Supabase persistence adapter", () => {
  it("writes using ignore-duplicate semantics and checks stored source data", async () => {
    const batch = await transformC02();
    const { repository, fetch } = repositoryWithResponses([
      new Response(null, { status: 201 }), json(batch.events[0]),
    ]);
    await repository.appendEvent(batch.events[0]);
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("on_conflict=id");
    expect(new Headers(options.headers).get("Prefer")).toContain("resolution=ignore-duplicates");
    expect(JSON.parse(String(options.body))).toEqual(batch.events[0]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("rejects conflicting source reuse after a skipped insert", async () => {
    const record = (await transformC02()).events[0];
    const { repository } = repositoryWithResponses([
      new Response(null, { status: 201 }), json({ ...record, event_type: "different source" }),
    ]);
    await expect(repository.appendEvent(record)).rejects.toThrow(/Conflicting source identity/);
  });
  it("propagates RLS denial without returning a successful append", async () => {
    const record = (await transformC02()).jobs[0];
    const { repository, fetch } = repositoryWithResponses([
      json({ code: "42501", message: "permission denied" }, 403),
    ]);
    await expect(repository.appendJob(record)).rejects.toThrow(/append failed/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("fails if inserted source data cannot be verified", async () => {
    const record = (await transformC02()).claims[0];
    const { repository } = repositoryWithResponses([
      new Response(null, { status: 201 }), json({ code: "42501", message: "denied" }, 403),
    ]);
    await expect(repository.appendClaim(record)).rejects.toThrow(/verification failed/);
  });
  it("resolves jobs by namespace plus external identifier", async () => {
    const record = (await transformC02()).jobs[0];
    const { repository, fetch } = repositoryWithResponses([json(record)]);
    expect(await repository.findJob({ source: record.source, external_id: record.external_id })).toEqual(record);
    const url = new URL(String((fetch.mock.calls[0] as unknown as [string])[0]));
    expect(url.searchParams.get("source")).toBe("eq.c02-supplied");
    expect(url.searchParams.get("external_id")).toBe("eq.W-1");
  });
  it("returns null for unknown jobs and fails closed on lookup errors", async () => {
    const { repository } = repositoryWithResponses([
      json(null), json({ code: "42501", message: "denied" }, 403),
    ]);
    const ref = { source: "c02-supplied", external_id: "absent" };
    expect(await repository.findJob(ref)).toBeNull();
    await expect(repository.findJob(ref)).rejects.toThrow(/lookup failed/);
  });
  it("compares timestamps by instant when PostgreSQL normalizes their text", async () => {
    const record = { ...(await transformC02()).events[0],
      time_kind: "timestamp" as const, occurred_at_raw: "2026-09-17T08:40:00+01:00", occurred_at: "2026-09-17T07:40:00.000Z" };
    const { repository } = repositoryWithResponses([
      new Response(null, { status: 201 }), json({ ...record, occurred_at: "2026-09-17T07:40:00+00:00" }),
    ]);
    await expect(repository.appendEvent(record)).resolves.toBeUndefined();
  });
});
