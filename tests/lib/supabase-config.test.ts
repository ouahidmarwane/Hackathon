import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSupabasePublicConfig,
  isPrivilegedKey,
} from "@/lib/supabase/config";

// Builds an unsigned JWT-shaped string with the given role claim.
function fakeJwt(role: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, "");
  return `${encode({ alg: "none" })}.${encode({ role })}.signature`;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isPrivilegedKey", () => {
  it("flags secret keys and service_role JWTs", () => {
    expect(isPrivilegedKey("sb_secret_x")).toBe(true);
    expect(isPrivilegedKey(fakeJwt("service_role"))).toBe(true);
  });

  it("allows publishable keys and anon JWTs", () => {
    expect(isPrivilegedKey("sb_publishable_x")).toBe(false);
    expect(isPrivilegedKey(fakeJwt("anon"))).toBe(false);
    expect(isPrivilegedKey("not-a-jwt")).toBe(false);
  });
});

describe("getSupabasePublicConfig", () => {
  it("fails clearly when not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(() => getSupabasePublicConfig()).toThrow(/not configured/);
  });

  it("refuses a privileged key in the public slot", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_x");
    expect(() => getSupabasePublicConfig()).toThrow(/privileged key/);
  });

  it("returns the public settings", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    expect(getSupabasePublicConfig()).toEqual({
      url: "http://localhost:54321",
      publishableKey: "sb_publishable_x",
    });
  });
});
