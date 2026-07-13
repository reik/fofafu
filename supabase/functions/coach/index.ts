// Ports backend/src/controllers/coach.controller.ts + coach.routes.ts +
// backend/src/services/coach/{featureFlags,claudeClient,rateLimit,costCap,
// holdback,systemPrompt}.ts.
//
// POST /coach -> coachComment. Flag-gated (404 when REPLY_COACH_ENABLED is
// not "true", checked before auth so anonymous probes get a clean 404,
// mirroring the Express route's requireCoachEnabled ordering).
//
// Simplification carried over unchanged from the Express version: rate
// limit, cost cap, and holdback state are in-memory, per-isolate counters —
// fine for the current single-instance-equivalent traffic level, called out
// as a known limitation in fofafu_vault/features/reply-coach-live.md. Also
// unchanged: `recordCoachEvent`/`coach_events` writes are NOT wired into
// this path (same gap as the Express controller — see
// backend/src/services/coach/coachEvents.ts, tested but never called from
// coachComment; out of scope for this straight port).
import Anthropic from "npm:@anthropic-ai/sdk@0.32";
import { corsHeaders, json, supabaseForRequest } from "../_shared/client.ts";

// ── schemas/coach.schemas.ts ────────────────────────────────────────────────

interface CoachThreadContext {
  postTitle: string;
  recentComments: { author: string; body: string }[];
}

interface CoachInput {
  draft: string;
  threadContext?: CoachThreadContext;
}

interface CoachResponse {
  verdict: "ok" | "suggest";
  categories: string[];
  reasoning: string;
  rewrite: string | null;
}

function parseCoachInput(body: unknown): CoachInput | null {
  if (typeof body !== "object" || body === null) return null;
  const draft = (body as Record<string, unknown>).draft;
  if (typeof draft !== "string" || draft.length < 1 || draft.length > 4000) return null;
  const threadContext = (body as Record<string, unknown>).threadContext;
  return { draft, threadContext: threadContext as CoachThreadContext | undefined };
}

// ── featureFlags.ts ──────────────────────────────────────────────────────────

function isReplyCoachEnabled(): boolean {
  return Deno.env.get("REPLY_COACH_ENABLED") === "true";
}
function isReplyCoachLiveEnabled(): boolean {
  return Deno.env.get("REPLY_COACH_LIVE_ENABLED") === "true";
}

// ── rateLimit.ts (per-isolate, 60 calls / rolling 60 min) ───────────────────

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_CALLS = 60;
const rateBuckets = new Map<string, number[]>();

function consumeCoachCall(userId: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const cutoff = now - RATE_WINDOW_MS;
  const fresh = (rateBuckets.get(userId) ?? []).filter((ts) => ts > cutoff);
  if (fresh.length >= RATE_MAX_CALLS) {
    const oldest = fresh[0] ?? now;
    rateBuckets.set(userId, fresh);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - now) / 1000)) };
  }
  fresh.push(now);
  rateBuckets.set(userId, fresh);
  return { allowed: true, retryAfterSeconds: 0 };
}

// ── costCap.ts ($5/day UTC, per-isolate) ────────────────────────────────────

const CAP_USD = 5;
let costDayKey = utcDayKey();
let spentUsd = 0;

function utcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
function rollCostCapIfNewDay(): void {
  const today = utcDayKey();
  if (today !== costDayKey) {
    costDayKey = today;
    spentUsd = 0;
  }
}
function recordCoachSpend(usd: number): void {
  rollCostCapIfNewDay();
  spentUsd += usd;
}
function isCoachCostCapExceeded(): boolean {
  rollCostCapIfNewDay();
  return spentUsd >= CAP_USD;
}

// ── holdback.ts (deterministic FNV-1a 50/50 split) ──────────────────────────

function isInHoldback(userId: string): boolean {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 2 === 0;
}

// ── systemPrompt.ts (verbatim) ───────────────────────────────────────────────

const COACH_SYSTEM_PROMPT =
  `You are the Reply Coach for fofafu, a foster-family community platform. You read a draft comment on an announcement thread and decide whether it risks re-traumatizing a foster parent, bio family member, or former-foster-youth reading the thread — and if so, offer one warmer phrasing.

You are advisory, never blocking. You do not moderate opinions, only phrasings known to harm in foster contexts (for example: minimization — "at least you got to keep her" — or savior-framing — "you're such a saint" / "real parents").

Voice rules — follow these exactly:

1. Warm and brief. One sentence per rewrite. No paragraphs, no preambles, no "I noticed…".
2. Peer, not moderator. Speak as another foster-community member sharing a phrasing that landed better — not as a platform enforcing a rule.
3. The rewrite carries the message; the label stays hidden. Never name the category in the rewrite or in any user-facing string ("this sounds like minimization" is forbidden). Category metadata is for backend/analytics only.
4. Never claim to know the author's intent. No "what you really mean is…", no "you actually feel…". Offer a phrasing; don't translate a person.
5. Once a category is flagged, always offer a rewrite. Silence after a flag would feel like a black box. If you can flag it, you can suggest one warmer way to say it.
6. When uncertain, stay silent. Return verdict "ok" rather than guessing. A wrong nudge erodes trust faster than a missed one.
7. No moralising. No therapy-speak. Avoid "I hear you", "valid", "journey", "lived experience" — they read as performance.
8. The rewrite itself is in the author's voice — first person, present tense, no "we".
9. No exclamation marks in rewrites or reasoning.
10. No emoji. Ever, in your output.

Output contract: respond with a single JSON object matching exactly this shape, and nothing else — no markdown fences, no commentary outside the JSON:

{
  "verdict": "ok" | "suggest",
  "categories": string[],
  "reasoning": string,
  "rewrite": string | null
}

When verdict is "ok": categories is [], reasoning is "", rewrite is null.
When verdict is "suggest": categories names the harm pattern(s) (e.g. "minimization", "savior-framing"), reasoning is one sentence explaining why the phrasing can land hard (never naming the category by name), and rewrite is one sentence, in the author's own voice, that says the same thing more gently.`;

// ── claudeClient.ts (mock fixtures + live Anthropic call) ──────────────────

const FIXTURE_OK: CoachResponse = { verdict: "ok", categories: [], reasoning: "", rewrite: null };
const FIXTURE_MINIMIZATION: CoachResponse = {
  verdict: "suggest",
  categories: ["minimization"],
  reasoning:
    '"At least" can shrink a loss the family is still carrying — a phrasing that stays with the loss tends to land softer.',
  rewrite: "The time you had with her mattered, and I'm sorry it's ending this way.",
};
const FIXTURE_SAVIOR: CoachResponse = {
  verdict: "suggest",
  categories: ["savior-framing"],
  reasoning: "Calling a foster parent a saint can make the everyday work feel like a performance — naming the care directly tends to feel closer.",
  rewrite: "He's lucky to have you showing up for him like this.",
};
const DRAFT_NEUTRAL = "Praying for your family this week.";
const DRAFT_MINIMIZATION = "At least you got to keep her for a while.";
const DRAFT_SAVIOR = "You're such a saint for taking him in.";

function mockCoach(input: CoachInput): CoachResponse {
  switch (input.draft) {
    case DRAFT_NEUTRAL:
      return FIXTURE_OK;
    case DRAFT_MINIMIZATION:
      return FIXTURE_MINIMIZATION;
    case DRAFT_SAVIOR:
      return FIXTURE_SAVIOR;
    default:
      return FIXTURE_OK;
  }
}

const INPUT_USD_PER_TOKEN = 0.8 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 4 / 1_000_000;

function buildUserMessage(input: CoachInput): string {
  const context = input.threadContext ? `\n\nThread context:\n${JSON.stringify(input.threadContext)}` : "";
  return `Draft comment:\n${input.draft}${context}`;
}

let anthropicSingleton: Anthropic | null = null;

async function liveCoach(input: CoachInput): Promise<CoachResponse> {
  if (!anthropicSingleton) {
    anthropicSingleton = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });
  }
  const response = await anthropicSingleton.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 512,
    system: [{ type: "text", text: COACH_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserMessage(input) }],
  });

  if (response.usage) {
    recordCoachSpend(
      response.usage.input_tokens * INPUT_USD_PER_TOKEN + response.usage.output_tokens * OUTPUT_USD_PER_TOKEN,
    );
  }
  const block = response.content[0];
  if (!block || block.type !== "text" || !("text" in block) || !block.text) {
    throw new Error("[coach] liveCoach: unexpected response shape from Anthropic client");
  }
  return JSON.parse(block.text) as CoachResponse;
}

async function coach(input: CoachInput, userId: string): Promise<CoachResponse> {
  const liveEligible = isReplyCoachLiveEnabled() && !isCoachCostCapExceeded() && !isInHoldback(userId);
  if (liveEligible) return liveCoach(input);
  return mockCoach(input);
}

// ── controller ────────────────────────────────────────────────────────────

const SILENT_FALLBACK: CoachResponse = { verdict: "ok", categories: [], reasoning: "", rewrite: null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Not found" }, 404);

  // Flag-gate before auth, mirroring Express's requireCoachEnabled ordering
  // (anonymous probes get a clean 404, not 401).
  if (!isReplyCoachEnabled()) return json({ error: "Not found" }, 404);

  const supabase = supabaseForRequest(req);
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (!userId) return json({ error: "No token provided" }, 401);

  // Rate-limit slot consumed BEFORE the try/catch on purpose — client
  // failures (timeouts, 5xx) count against the user's quota by design.
  const limit = consumeCoachCall(userId);
  if (!limit.allowed) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const body = await req.json().catch(() => null);
  const input = parseCoachInput(body);
  if (!input) return json({ error: "Invalid request body" }, 400);

  try {
    const result = await coach(input, userId);
    return json(result, 200);
  } catch (err) {
    // Never log the draft, threadContext, or any user-supplied field — only
    // the error class/message.
    const message = err instanceof Error ? err.message : "unknown error";
    console.warn(JSON.stringify({ msg: "coach client failure", message }));
    return json(SILENT_FALLBACK, 200);
  }
});
