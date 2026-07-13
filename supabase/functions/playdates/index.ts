// Ports backend/src/controllers/playdates.controller.ts + playdate.routes.ts.
// Routes (relative to the function base URL):
//   GET    /playdates/availability/:familyId -> getAvailability
//   POST   /playdates/availability            -> addSlot
//   PUT    /playdates/availability/:id        -> updateSlot
//   DELETE /playdates/availability/:id        -> deleteSlot
//   GET    /playdates/requests                -> getRequests
//   POST   /playdates/requests                -> createRequest
//   PUT    /playdates/requests/:id/respond    -> respondToRequest
// RLS (20260711010000_auth_trigger_and_rls.sql) already enforces ownership
// (availability_slots writable only by the owning family; playdate_requests
// updatable only by requester/owner, column-restricted to `status`), so this
// function only needs to replicate the app-level rules RLS can't express:
// hiding busy slots from non-owners, "can't request your own slot",
// "no duplicate pending request", "request already resolved".
import { corsHeaders, json, supabaseForRequest } from "../_shared/client.ts";

interface SlotRow {
  id: string;
  family_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: "free" | "busy";
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface RequestRow {
  id: string;
  slot_id: string;
  requester_family_id: string;
  owner_family_id: string;
  message: string | null;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  updated_at: string;
}

function toSlotDTO(row: SlotRow): Record<string, unknown> {
  return {
    id: row.id,
    familyId: row.family_id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// deno-lint-ignore no-explicit-any
async function toRequestDTO(supabase: any, row: RequestRow): Promise<Record<string, unknown>> {
  const [{ data: requester }, { data: owner }, { data: slot }] = await Promise.all([
    supabase.from("families").select("name").eq("id", row.requester_family_id).maybeSingle(),
    supabase.from("families").select("name").eq("id", row.owner_family_id).maybeSingle(),
    supabase.from("availability_slots").select("date, start_time, end_time").eq("id", row.slot_id).maybeSingle(),
  ]);
  return {
    id: row.id,
    slotId: row.slot_id,
    requesterFamilyId: row.requester_family_id,
    ownerFamilyId: row.owner_family_id,
    message: row.message,
    status: row.status,
    requesterName: requester?.name ?? null,
    ownerName: owner?.name ?? null,
    slotDate: slot?.date ?? null,
    slotStartTime: slot?.start_time ?? null,
    slotEndTime: slot?.end_time ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = supabaseForRequest(req);
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (!userId) return json({ error: "Not authenticated" }, 401);

  const { data: myFamily } = await supabase.from("families").select("id").eq("user_id", userId).maybeSingle();
  const myFamilyId: string | null = myFamily?.id ?? null;

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean).slice(1);

  if (req.method === "GET" && segments.length === 2 && segments[0] === "availability") {
    const familyId = segments[1];
    let query = supabase.from("availability_slots").select("*").eq("family_id", familyId);
    if (familyId !== myFamilyId) query = query.eq("status", "free");
    const { data, error } = await query.order("date").order("start_time");
    if (error) return json({ error: error.message }, 500);
    return json((data as SlotRow[]).map(toSlotDTO));
  }

  if (req.method === "POST" && segments.length === 1 && segments[0] === "availability") {
    if (!myFamilyId) return json({ error: "Family not found" }, 404);
    const body = await req.json().catch(() => ({}));
    const { data, error } = await supabase
      .from("availability_slots")
      .insert({
        family_id: myFamilyId,
        date: body.date,
        start_time: body.startTime,
        end_time: body.endTime,
        status: body.status ?? "free",
        note: body.note ?? null,
      })
      .select("*")
      .single();
    if (error) return json({ error: error.message }, 500);
    return json(toSlotDTO(data as SlotRow), 201);
  }

  if ((req.method === "PUT" || req.method === "DELETE") && segments.length === 2 && segments[0] === "availability") {
    const id = segments[1];
    const { data: slot, error: fetchErr } = await supabase
      .from("availability_slots").select("*").eq("id", id).maybeSingle();
    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!slot) return json({ error: "Slot not found" }, 404);
    if ((slot as SlotRow).family_id !== myFamilyId) return json({ error: "Forbidden" }, 403);

    if (req.method === "DELETE") {
      const { error } = await supabase.from("availability_slots").delete().eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    const body = await req.json().catch(() => ({}));
    const row = slot as SlotRow;
    const { data, error } = await supabase
      .from("availability_slots")
      .update({
        date: body.date ?? row.date,
        start_time: body.startTime ?? row.start_time,
        end_time: body.endTime ?? row.end_time,
        status: body.status ?? row.status,
        note: body.note !== undefined ? body.note : row.note,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return json({ error: error.message }, 500);
    return json(toSlotDTO(data as SlotRow));
  }

  if (req.method === "GET" && segments.length === 1 && segments[0] === "requests") {
    if (!myFamilyId) return json([]);
    const { data, error } = await supabase
      .from("playdate_requests")
      .select("*")
      .or(`requester_family_id.eq.${myFamilyId},owner_family_id.eq.${myFamilyId}`)
      .order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    const dtos = await Promise.all((data as RequestRow[]).map((r) => toRequestDTO(supabase, r)));
    return json(dtos);
  }

  if (req.method === "POST" && segments.length === 1 && segments[0] === "requests") {
    if (!myFamilyId) return json({ error: "Family not found" }, 404);
    const body = await req.json().catch(() => ({}));
    const slotId = body.slotId as string | undefined;
    if (!slotId) return json({ error: "slotId is required" }, 400);

    const { data: slot, error: slotErr } = await supabase
      .from("availability_slots").select("*").eq("id", slotId).eq("status", "free").maybeSingle();
    if (slotErr) return json({ error: slotErr.message }, 500);
    if (!slot) return json({ error: "Slot not found or not available" }, 404);
    const slotRow = slot as SlotRow;
    if (slotRow.family_id === myFamilyId) return json({ error: "Cannot request your own slot" }, 400);

    const { data: existing, error: existingErr } = await supabase
      .from("playdate_requests")
      .select("id")
      .eq("requester_family_id", myFamilyId)
      .eq("slot_id", slotId)
      .eq("status", "pending")
      .maybeSingle();
    if (existingErr) return json({ error: existingErr.message }, 500);
    if (existing) return json({ error: "You already have a pending request for this slot" }, 400);

    const { data: inserted, error: insertErr } = await supabase
      .from("playdate_requests")
      .insert({
        slot_id: slotId,
        requester_family_id: myFamilyId,
        owner_family_id: slotRow.family_id,
        message: body.message ?? null,
      })
      .select("*")
      .single();
    if (insertErr) return json({ error: insertErr.message }, 500);
    return json(await toRequestDTO(supabase, inserted as RequestRow), 201);
  }

  if (req.method === "PUT" && segments.length === 3 && segments[0] === "requests" && segments[2] === "respond") {
    const id = segments[1];
    const { data: request, error: fetchErr } = await supabase
      .from("playdate_requests").select("*").eq("id", id).maybeSingle();
    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!request) return json({ error: "Request not found" }, 404);
    const row = request as RequestRow;
    if (row.owner_family_id !== myFamilyId) return json({ error: "Forbidden" }, 403);
    if (row.status !== "pending") return json({ error: "Request already resolved" }, 400);

    const body = await req.json().catch(() => ({}));
    const { data: updated, error: updateErr } = await supabase
      .from("playdate_requests")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (updateErr) return json({ error: updateErr.message }, 500);
    return json(await toRequestDTO(supabase, updated as RequestRow));
  }

  return json({ error: "Not found" }, 404);
});
