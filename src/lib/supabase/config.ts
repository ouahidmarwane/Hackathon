export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

/**
 * Reads the public Supabase settings. Both values are safe in the browser:
 * data access is limited by Row Level Security, not by keeping them secret.
 *
 * Next.js inlines NEXT_PUBLIC_ variables only when they are referenced
 * literally, so keep the `process.env.NEXT_PUBLIC_...` accesses as written.
 */
export function getSupabasePublicConfig(): SupabasePublicConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).",
    );
  }
  if (isPrivilegedKey(publishableKey)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a privileged key. " +
        "Use the publishable (or legacy anon) key; privileged keys must stay server-only.",
    );
  }

  return { url, publishableKey };
}

/** Detects secret keys (sb_secret_...) and legacy service_role JWTs. */
export function isPrivilegedKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;

  const payload = key.split(".")[1];
  if (!payload) return false;
  try {
    const claims: unknown = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return (
      typeof claims === "object" &&
      claims !== null &&
      (claims as { role?: unknown }).role === "service_role"
    );
  } catch {
    return false;
  }
}
