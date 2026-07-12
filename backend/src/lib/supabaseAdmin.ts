import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Service-role Supabase client, used only to verify Supabase-issued session
 * tokens sent by the frontend (auth.getUser). Lazily constructed so routes
 * that never see a Supabase token (e.g. during local dev/test against the
 * legacy Express-issued JWT) don't require these env vars to be set.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to verify a Supabase-issued auth token.'
      );
    }
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}
