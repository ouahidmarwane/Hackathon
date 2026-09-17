import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "./config";

/**
 * Non-privileged Supabase client for server code (Server Components, Route
 * Handlers, Server Actions). Uses the publishable key, so Row Level Security
 * still applies. A new client is created per call so no session state is
 * shared between requests.
 *
 * There is deliberately no privileged (secret-key) client yet. Add one only
 * when a server-side, human-approved write requires it
 * (docs/architecture/architecture.md, "Human approval boundary").
 */
export function createSupabaseServerClient(): SupabaseClient {
  const { url, publishableKey } = getSupabasePublicConfig();
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
