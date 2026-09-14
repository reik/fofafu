// QA-authored, written BEFORE the implementation per this project's TDD rule
// (fofafu_vault/protocols/dispatch.md + ~/.claude/agents.md: "tests should
// FAIL initially — no implementation exists"). `./moderation.ts` does not
// exist yet as of this writing, so this file is EXPECTED to fail to resolve
// its import (`deno test` reports a module-not-found error). That is the
// correct red state, not a defect in this test file.
//
// This proposes the seam backend-dev should implement the write-time
// classifier gate behind, for fofafu_vault/features/content-moderation-gate.md.
// Modeled directly on the precedent set by
// `backend/src/services/coach/claudeClient.ts`'s `setClaudeClientForTests`
// swap hook and `backend/src/services/coach/featureFlags.ts`'s
// `isReplyCoachEnabled()` — same shape, same "read env on every call, no
// caching" rule, same test-injection pattern.
//
// This is QA's PROPOSED contract, not a backend-dev commitment. If
// tech-lead/backend-dev land the gate with a different shape or in a
// different location (e.g. inline in `announcement/index.ts`, a dedicated
// `moderation` Edge Function, or reusing the Express `ClaudeClient` seam
// instead of a Deno-land module), adapt this file's import path/shape to
// match and note the deviation in the feature's ### Test plan — but the
// DECISION LOGIC these tests lock down should hold regardless of where the
// code physically lives:
//   1. The fail-open/fail-closed policy governs ONLY classifier
//      unavailability (throw or timeout) — it must never let a genuine
//      positive flag through. That's the feature's "no override / no
//      post-anyway" AC, and it must survive whichever failure policy ships.
//   2. A classifier timeout is treated identically to a classifier throw.
//   3. The category taxonomy is a closed, named set (final wording is
//      ux-writer's call per AC #2 — this only locks the shape/count so a
//      future rename is a deliberate test update, not silent drift).
//   4. The feature flag defaults off and only the exact string "true"
//      turns it on, per the `reply_coach_enabled`/`reply_coach_live_enabled`
//      precedent named explicitly in AC #7.
import { assertEquals } from "jsr:@std/assert@1";
import {
  evaluateContent,
  isContentModerationEnabled,
  MODERATION_CATEGORIES,
  setModerationClassifierForTests,
} from "./moderation.ts";

const FLAG_VAR = "CONTENT_MODERATION_ENABLED";

function resetClassifier() {
  setModerationClassifierForTests(null);
}

// ── AC: "classified against a defined set of ... violation categories" ─────

Deno.test("MODERATION_CATEGORIES — provisional taxonomy covers all 6 AC-named violation types, no duplicates", () => {
  // Placeholder pending ux-writer's final taxonomy/voice (AC #2 — note this
  // feature's frontmatter currently has `collaborators: []`, so it is not
  // confirmed ux-writer has been spawned this pass; flagged separately in
  // ### Test plan's risk notes). This test locks the SHAPE (6 categories,
  // matching the AC's named list) so a future taxonomy rename is visible.
  assertEquals(MODERATION_CATEGORIES.length, 6);
  assertEquals(new Set(MODERATION_CATEGORIES).size, 6);
});

// ── AC: "gated behind a feature flag, defaulting off" ───────────────────────

Deno.test("isContentModerationEnabled — defaults to false when unset", () => {
  Deno.env.delete(FLAG_VAR);
  assertEquals(isContentModerationEnabled(), false);
});

Deno.test("isContentModerationEnabled — false for any value other than the exact string 'true'", () => {
  for (const v of ["1", "TRUE", "yes", "false", ""]) {
    Deno.env.set(FLAG_VAR, v);
    assertEquals(isContentModerationEnabled(), false, `expected false for "${v}"`);
  }
  Deno.env.delete(FLAG_VAR);
});

Deno.test("isContentModerationEnabled — true only for the exact string 'true'", () => {
  Deno.env.set(FLAG_VAR, "true");
  assertEquals(isContentModerationEnabled(), true);
  Deno.env.delete(FLAG_VAR);
});

// ── AC: "if not flagged, publish proceeds ... silent on clean content" ─────

Deno.test("evaluateContent — clean content is allowed, not flagged", async () => {
  setModerationClassifierForTests(() => Promise.resolve({ flagged: false, categories: [] }));
  try {
    const outcome = await evaluateContent("Praying for your family this week.", "fail-closed");
    assertEquals(outcome, { allowed: true, flagged: false, categories: [], reason: "clean" });
  } finally {
    resetClassifier();
  }
});

// ── AC: "no override/'post anyway' path" — must hold under EITHER policy ───

Deno.test("evaluateContent — flagged content is never allowed under fail-closed", async () => {
  setModerationClassifierForTests(() => Promise.resolve({ flagged: true, categories: ["harassment"] }));
  try {
    const outcome = await evaluateContent("...", "fail-closed");
    assertEquals(outcome.allowed, false);
    assertEquals(outcome.reason, "flagged");
    assertEquals(outcome.categories, ["harassment"]);
  } finally {
    resetClassifier();
  }
});

Deno.test("evaluateContent — flagged content is never allowed under fail-open either (no override path)", async () => {
  // This is the load-bearing test for the feature's "no override / no post
  // anyway" AC: fail-open/fail-closed is a policy about the CLASSIFIER
  // being unavailable, never about what happens once it HAS produced a
  // positive flag. A future change that lets fail-open leak into this
  // branch would be a regression on the AC, not a legitimate policy tweak.
  setModerationClassifierForTests(() => Promise.resolve({ flagged: true, categories: ["spam"] }));
  try {
    const outcome = await evaluateContent("...", "fail-open");
    assertEquals(outcome.allowed, false);
    assertEquals(outcome.reason, "flagged");
  } finally {
    resetClassifier();
  }
});

// ── Open question: fail-open vs fail-closed on classifier failure/timeout ──
// Both branches are written and both pass today — whichever policy
// backend-dev/tech-lead actually pick becomes the one the Edge Function
// wires up by default; the other stays green as documentation of the
// rejected alternative's exact behavior (useful if the decision is
// revisited later).

Deno.test("evaluateContent — classifier throw + fail-open policy silently allows (matches reply-coach's silent-200 precedent)", async () => {
  setModerationClassifierForTests(() => Promise.reject(new Error("network error")));
  try {
    const outcome = await evaluateContent("...", "fail-open");
    assertEquals(outcome, { allowed: true, flagged: false, categories: [], reason: "classifier-unavailable" });
  } finally {
    resetClassifier();
  }
});

Deno.test("evaluateContent — classifier throw + fail-closed policy blocks the write", async () => {
  setModerationClassifierForTests(() => Promise.reject(new Error("network error")));
  try {
    const outcome = await evaluateContent("...", "fail-closed");
    assertEquals(outcome, { allowed: false, flagged: false, categories: [], reason: "classifier-unavailable" });
  } finally {
    resetClassifier();
  }
});

Deno.test("evaluateContent — classifier timeout is treated identically to a throw, under both policies", async () => {
  setModerationClassifierForTests(() => new Promise(() => {})); // never resolves
  try {
    const openOutcome = await evaluateContent("...", "fail-open", 20);
    assertEquals(openOutcome.reason, "classifier-unavailable");
    assertEquals(openOutcome.allowed, true);

    const closedOutcome = await evaluateContent("...", "fail-closed", 20);
    assertEquals(closedOutcome.reason, "classifier-unavailable");
    assertEquals(closedOutcome.allowed, false);
  } finally {
    resetClassifier();
  }
});

// ── Test-seam hygiene (prevents cross-test pollution, same shape as
// reply-coach's setClaudeClientForTests(null) revert behavior) ─────────────

Deno.test("setModerationClassifierForTests(null) clears a previous override so the next override starts clean", async () => {
  setModerationClassifierForTests(() => Promise.resolve({ flagged: true, categories: ["spam"] }));
  resetClassifier();
  setModerationClassifierForTests(() => Promise.resolve({ flagged: false, categories: [] }));
  try {
    const outcome = await evaluateContent("...", "fail-closed");
    assertEquals(outcome.reason, "clean"); // would be "flagged" if the old override leaked
  } finally {
    resetClassifier();
  }
});
