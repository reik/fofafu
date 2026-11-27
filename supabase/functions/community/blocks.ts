// Which families a community listing must leave out because of a block.
//
// `blocks` RLS (supabase/migrations/20260904000000_moderation_reports_blocks.sql)
// lets a caller read only the rows where their own family is the blocker,
// so the caller's own client can answer "whom have I blocked" and nothing
// else. That is all /community/recent applies.
//
// /community/suggested also has to leave out families that blocked the
// caller (fofafu_vault/features/messages-two-pane.md: "blocked families in
// either direction"). No policy lets the blocked family read those rows, by
// design: a blocked family must not be able to find out who blocked them.
// So that one lookup goes through a service-role client, scoped by a
// parameterized eq() to the caller's own family id (itself read with the
// caller's own client), and its result is only ever used to drop rows from
// the response. The ids are never returned, logged or counted back to the
// caller, the same rule admin/index.ts follows for its service-role calls.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function serviceRoleClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Defensive UUID filter, same reasoning as search/index.ts's own query
// sanitization: these ids get interpolated into a PostgREST .not(...,"in",
// "(...)") filter string, so only well-formed UUID characters (which can't
// contain the DSL's own comma/paren/quote syntax) are let through.
function uuidsIn(rows: Record<string, string>[] | null, column: string): string[] {
  return (rows ?? []).map((r) => r[column]).filter((id) => typeof id === "string" && UUID_RE.test(id));
}

// Families the caller has blocked, via the caller's own client.
export async function blockedFamilyIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("blocks").select("blocked_family_id");
  if (error) throw new Error(error.message);
  return uuidsIn(data, "blocked_family_id");
}

// Families that have blocked `familyId`, via the service-role client. See
// the header comment for why this one can't use the caller's client.
export async function blockingFamilyIds(service: SupabaseClient, familyId: string): Promise<string[]> {
  if (!UUID_RE.test(familyId)) return [];
  const { data, error } = await service.from("blocks").select("blocker_family_id").eq("blocked_family_id", familyId);
  if (error) throw new Error(error.message);
  return uuidsIn(data, "blocker_family_id");
}
