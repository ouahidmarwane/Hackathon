import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseAdminClient, getSupabaseAdminConfig } from "@/lib/supabase/admin";

afterEach(() => vi.unstubAllEnvs());

const publicConfig = () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
};

describe("privileged admin client configuration", () => {
  it("fails closed when the service-role key is missing", () => {
    publicConfig();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => getSupabaseAdminConfig()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("refuses a non-privileged key in the service-role slot", () => {
    publicConfig();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_publishable_not_privileged");
    expect(() => getSupabaseAdminConfig()).toThrow(/privileged/);
  });

  it("refuses a NEXT_PUBLIC_ service-role variable", () => {
    publicConfig();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_service_role_test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "sb_secret_service_role_test");
    expect(() => getSupabaseAdminConfig()).toThrow(/NEXT_PUBLIC_/);
  });

  it("constructs a new privileged client per call with server-only configuration", () => {
    publicConfig();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_service_role_test");
    expect(getSupabaseAdminConfig()).toEqual({
      url: "http://localhost:54321",
      serviceRoleKey: "sb_secret_service_role_test",
    });
    expect(createSupabaseAdminClient()).not.toBe(createSupabaseAdminClient());
  });
});
