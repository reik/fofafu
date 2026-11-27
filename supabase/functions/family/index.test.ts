// city/state on the single-family response, added for the /messages "About
// this family" rail (fofafu_vault/features/messages-two-pane.md). No
// network/Postgres, same fake-client pattern as community/index.test.ts.
import { assertEquals } from "jsr:@std/assert@1";
import { handleRequest } from "./index.ts";
// deno-lint-ignore no-explicit-any
type Any = any;

interface Call {
  method: string;
  args: unknown[];
}

const ME = "10000000-0000-4000-8000-000000000000";
const FAMILY = "f0000000-0000-4000-8000-000000000001";
const OWNER = "10000000-0000-4000-8000-000000000001";

function row(city: string | null | undefined, state: string | null | undefined, userId = OWNER) {
  return {
    id: FAMILY,
    user_id: userId,
    name: "Lee",
    bio: "",
    kid_count: 2,
    avatar_url: null,
    updated_at: "t",
    city,
    state,
  };
}

// Answers a maybeSingle() lookup with `found` when its eq() filter matches.
function makeFake(userId: string | null, found: Record<string, unknown>) {
  function builder(): Any {
    const calls: Call[] = [];
    const chain: Any = {};
    for (const m of ["select", "eq", "maybeSingle"]) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ method: m, args });
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => void) => {
      const eq = calls.find((c) => c.method === "eq")?.args as [string, string] | undefined;
      const match = eq && found[eq[0]] === eq[1];
      resolve({ data: match ? found : null, error: null });
    };
    return chain;
  }
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: userId ? { id: userId } : null } }) },
    from: () => builder(),
  } as Any;
}

async function get(path: string, userId: string | null, found: Record<string, unknown>) {
  const res = await handleRequest(new Request(`https://x.supabase.co/family/${path}`), makeFake(userId, found));
  return { res, body: await res.json() };
}

Deno.test("GET /family/:id returns the family's city and state", async () => {
  const { body } = await get(FAMILY, ME, row("Oakland", "CA"));
  assertEquals([body.city, body.state], ["Oakland", "CA"]);
});

Deno.test("GET /family/:id returns null for an empty city and state", async () => {
  const { body } = await get(FAMILY, ME, row("", "  "));
  assertEquals([body.city, body.state], [null, null]);
});

Deno.test("GET /family/:id returns null when the row has no city or state", async () => {
  const { body } = await get(FAMILY, ME, row(undefined, null));
  assertEquals([body.city, body.state], [null, null]);
});

Deno.test("GET /family/:id trims surrounding spaces from city and state", async () => {
  const { body } = await get(FAMILY, ME, row(" Oakland ", "CA "));
  assertEquals([body.city, body.state], ["Oakland", "CA"]);
});

Deno.test("GET /family/:id resolves an owner's user id too, with city and state", async () => {
  const { body } = await get(OWNER, ME, row("Oakland", "CA"));
  assertEquals([body.id, body.city], [FAMILY, "Oakland"]);
});

Deno.test("GET /family/:id keeps every existing field and only adds city and state", async () => {
  const { body } = await get(FAMILY, ME, row("Oakland", "CA"));
  assertEquals(Object.keys(body).sort(), [
    "avatarUrl",
    "bio",
    "city",
    "id",
    "isOwner",
    "kidCount",
    "name",
    "ownerId",
    "state",
    "updatedAt",
  ]);
});

Deno.test("GET /family/:id still hides kidCount from a non-owner", async () => {
  const { body } = await get(FAMILY, ME, row("Oakland", "CA"));
  assertEquals([body.kidCount, body.isOwner], [null, false]);
});

Deno.test("GET /family/:id returns 404 for an unknown family", async () => {
  const { res } = await get("f0000000-0000-4000-8000-000000000099", ME, row("Oakland", "CA"));
  assertEquals(res.status, 404);
});

Deno.test("GET /family/me returns the caller's city and state", async () => {
  const { body } = await get("me", ME, row("Oakland", "CA", ME));
  assertEquals([body.city, body.state, body.isOwner], ["Oakland", "CA", true]);
});

Deno.test("GET /family/me returns 401 when unauthenticated", async () => {
  const { res } = await get("me", null, row("Oakland", "CA", ME));
  assertEquals(res.status, 401);
});
