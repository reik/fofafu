// Shared per-request Supabase client for Edge Functions. Forwards the
// caller's Authorization header so RLS policies (auth.uid()) evaluate as the
// calling user, not the service role — mirrors Express's authenticate
// middleware (backend/src/middleware/auth.middleware.ts) but relies on
// Supabase Auth's own JWT verification instead of a hand-rolled jsonwebtoken
// check.
import { createClient } from "jsr:@supabase/supabase-js@2";

export function supabaseForRequest(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

export async function requireUserId(req: Request): Promise<string | null> {
  const supabase = supabaseForRequest(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
