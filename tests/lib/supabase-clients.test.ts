import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createSupabaseServerClient } from "@/lib/supabase/server";

afterEach(() => vi.unstubAllEnvs());

describe("public client initialization (no network)", () => {
  it("constructs server clients per call and a shared browser client with public configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    expect(createSupabaseServerClient()).not.toBe(createSupabaseServerClient());
    expect(getSupabaseBrowserClient()).toBe(getSupabaseBrowserClient());
  });
  it("server client initialization still rejects privileged public configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_test");
    expect(() => createSupabaseServerClient()).toThrow(/privileged/);
  });
});
