import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig, isPrivilegedKey } from "./config";

/**
 * Privileged Supabase client for the server-owned human decision write path.
 * Uses a server-only service-role key. It must never be constructed from a
 * NEXT_PUBLIC_ variable and is never bundled into client code.
 *
 * This is the first privileged writer (M06); its use is limited to the narrow
 * human_decisions table grants in the migration.
 */
export function getSupabaseAdminConfig() {
  const { url } = getSupabasePublicConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "Supabase server writes are not configured. Set " +
        "SUPABASE_SERVICE_ROLE_KEY (see .env.example).",
    );
  }
  if (!isPrivilegedKey(serviceRoleKey)) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be a privileged service-role key.",
    );
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "The service-role key must not use a NEXT_PUBLIC_ prefix.",
    );
  }
  return { url, serviceRoleKey };
}

export function createSupabaseAdminClient(): SupabaseClient {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
