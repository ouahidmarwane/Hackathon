import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "./config";

let browserClient: SupabaseClient | undefined;

/**
 * Supabase client for Client Components. Uses the publishable key only.
 * One instance is shared per browser tab.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    const { url, publishableKey } = getSupabasePublicConfig();
    browserClient = createClient(url, publishableKey);
  }
  return browserClient;
}
