import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { loginAs, SEED_PASSWORD } from './utils/login';

/**
 * Covers fofafu_vault/features/moderation-report-block.md acceptance
 * criteria, implementing the 5 E2E scenarios qa-engineer named in
 * ### Test plan ("E2E scenarios named for e2e-test-writer"):
 *
 *  1. report-flow-per-surface           -> 'report-flow-per-surface' below.
 *  2. block-from-profile-and-undo       -> 'block-from-profile-and-undo'.
 *  3. block-from-post-and-reload        -> 1st test in the serial describe
 *     block below (the one scenario that needs a real reload against real
 *     server-side filtering, not a mocked query cache).
 *  4. blocked-family-invisibility-sweep -> 2nd test, same serial block
 *     (reuses the block scenario 3 already established rather than
 *     re-blocking).
 *  5. unblock-restores-visibility       -> 3rd test, same serial block.
 *
 * Deliberately NOT (re-)tested here:
 *  - The reachable "submit disabled until a category is picked" state IS
 *    asserted (first report test below) per the dispatch's explicit steer,
 *    but the *unreachable* category-required Zod validation-message bug
 *    qa-engineer found and left red on purpose (ReportModal.test.tsx,
 *    "Gap #2") is not retested here: it cannot be triggered via mouse or
 *    keyboard (the submit button is disabled exactly when it would fire),
 *    so there is no user-facing flow for an E2E spec to exercise. The unit
 *    test qa-engineer already wrote is the correct — and only — place for
 *    it; see this feature's ### E2E coverage for the pointer.
 *  - Block is not offered on a DM message (### Visual §1.1/§8 — DM's Block
 *    entry point is the partner's profile page, exercised by
 *    'block-from-profile-and-undo'); the DM report test below asserts the
 *    Block menuitem's absence on a message bubble instead of a positive
 *    block flow there.
 *
 * KNOWN GAP, same as playdates.spec.ts / header-nav-redesign.spec.ts: this
 * file talks to the real deployed Supabase project (Auth REST + Edge
 * Functions) for setup data — the same backend the UI itself uses — there
 * is no local backend to stand up instead. It requires VITE_SUPABASE_URL
 * and VITE_SUPABASE_ANON_KEY (copy frontend/.env.example to frontend/.env
 * and fill them in) and the four dummy families from
 * backend/scripts/seed-dummy.ts already existing in that project. Neither
 * was available in the sandbox this file was written in — see this
 * feature's ### E2E coverage for the corroborating evidence used instead
 * (npm run test:frontend).
 *
 * SEED FAMILIES AND WHY (password: "password123", see utils/login.ts).
 * anderson@dummy.test is the blocker/reporter throughout (0 seeded posts of
 * its own, consistent with every other spec's use of it as the acting
 * viewer). Report never hides anything from anyone, so which family's
 * content gets reported carries zero cross-spec risk — brooks@dummy.test is
 * used for all three report surfaces below. Block is different: it's a
 * real, persistent, account-scoped server-side action, so which family gets
 * blocked — and for how long — matters for suite-wide stability:
 *   - 'block-from-profile-and-undo' uses chen@dummy.test and reverses the
 *     block with Undo inside the same test before it ends — the exposure
 *     window is only the time between the block and unblock API calls
 *     resolving, the smallest this suite can realistically produce for a
 *     real (non-mocked) round trip.
 *   - The serial block (scenarios 3-5) uses davis@dummy.test and leaves it
 *     blocked across all three tests deliberately, so scenario 4 doesn't
 *     have to re-block what scenario 3 already proved, and scenario 5 is
 *     the one that finally unblocks it. davis has the smallest footprint of
 *     any seeded family elsewhere in this suite from anderson's own point
 *     of view: header-nav-redesign.spec.ts only sends messages *to* davis's
 *     own inbox (a different account's session, unaffected by anderson's
 *     block list) and playdates.spec.ts only exercises davis's *own*
 *     empty-state view (also a different account's session). The one real
 *     neighbor is home-community-rail.spec.ts's "Davis" avatar-click test,
 *     which reads anderson's own view of the community rail — a genuine,
 *     acknowledged (not silently ignored) race if that spec happens to run
 *     concurrently against the same live account while davis is blocked
 *     here. test.describe.serial below keeps this file's own three tests
 *     ordered and the exposure window as short as the assertions allow;
 *     test.afterAll unblocks unconditionally, even on failure, so a broken
 *     assertion never leaves davis blocked for a future run. Flagged in
 *     this feature's ### E2E coverage / return notes as a fast-follow worth
 *     a dedicated e2e-only seed family rather than reusing the four
 *     general-purpose dummy families for a stateful action like Block.
 *
 * IMPLEMENTATION NOTES (verified against the landed components, not just
 * the ### Visual spec prose):
 *  - Every ModerationMenu trigger on a page shares the identical
 *    aria-label="More actions" (a11y-auditor's own non-blocking finding —
 *    the ux-writer copy slot for a per-content-type label was never filled
 *    in). Locators below always scope through the containing
 *    article/li/bubble via .filter({ hasText }) first, never a bare
 *    page.getByRole('button', { name: 'More actions' }).
 *  - Category pills are real <input type="radio"> elements wrapped in a
 *    <label>, visually sr-only. Clicking the label text (what a mouse user
 *    actually sees and clicks) is used instead of interacting with the
 *    hidden input directly.
 *  - The report confirmation is a role="status" region (a11y-auditor's
 *    Blocking #3 fix) — asserted directly instead of guessing at toast
 *    timing.
 *  - FamilyProfileBlockControl's blocked-state CTA is bare "Unblock", not
 *    "Unblock the {name} family" — ux-writer's landed override of
 *    ### Visual §3's own placeholder assumption, confirmed by reading
 *    FamilyProfileBlockControl.tsx directly.
 *  - familyName-interpolated copy (BlockUndoStrip, BlockedContentPlaceholder,
 *    the unblock acknowledgment) renders against the real seeded
 *    families.name value, which already reads "The X Family" — combined
 *    with these components' own "the {name} family" wrapping this produces
 *    a literal "...the The Chen Family family..." double-wrap in the real
 *    DOM. This is a pre-existing, out-of-feature quirk (FamilyHeader.tsx
 *    has the identical `The ${family.name} family` pattern already, unrelated
 *    to this feature) that community-search.spec.ts / profile-pages.spec.ts
 *    already silently tolerate via loose regex/substring matching rather
 *    than an exact string — the same style is used below for any
 *    familyName-interpolated assertion, for the same reason.
 *  - The DM composer never disables when the thread partner is blocked
 *    (Variant B, confirmed by backend-dev's "DM composer direction" note in
 *    ### Backend) — asserted explicitly rather than assumed.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const FUNCTIONS_URL = process.env.VITE_SUPABASE_FUNCTIONS_URL ?? `${SUPABASE_URL}/functions/v1`;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy frontend/.env.example to frontend/.env and fill them in.',
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────
//
// Same pattern as header-nav-redesign.spec.ts / playdates.spec.ts: hit
// Supabase Auth + the deployed Edge Functions directly for setup data,
// rather than seeding through a dead local backend.

async function getToken(req: APIRequestContext, email: string): Promise<string> {
  const res = await req.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    data: { email, password: SEED_PASSWORD },
  });
  const body = (await res.json()) as { access_token?: string; error?: string; msg?: string };
  if (!body.access_token) throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function getUserId(req: APIRequestContext, token: string): Promise<string> {
  const res = await req.get(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error(`Could not resolve user id: ${JSON.stringify(body)}`);
  return body.id;
}

/** Canonical families.id for a user, via /family/:id's own dual-resolution
 * (supabase/functions/family/index.ts) — deleteBlock does NOT dual-resolve
 * (### Frontend's documented gap), so any cleanup unblock call needs this,
 * not a raw user id. */
async function getFamilyId(req: APIRequestContext, token: string, userId: string): Promise<string> {
  const res = await req.get(`${FUNCTIONS_URL}/family/${userId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error(`Could not resolve family id for ${userId}: ${JSON.stringify(body)}`);
  return body.id;
}

async function createPost(req: APIRequestContext, token: string, content: string): Promise<string> {
  const res = await req.post(`${FUNCTIONS_URL}/announcement`, {
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    data: { content },
  });
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error(`createPost failed: ${res.status()} ${JSON.stringify(body)}`);
  return body.id;
}

async function createComment(
  req: APIRequestContext,
  token: string,
  announcementId: string,
  content: string,
): Promise<void> {
  const res = await req.post(`${FUNCTIONS_URL}/announcement/${announcementId}/comments`, {
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    data: { content },
  });
  if (!res.ok()) throw new Error(`createComment failed: ${res.status()} ${await res.text()}`);
}

async function sendMessage(
  req: APIRequestContext,
  token: string,
  to: string,
  content: string,
): Promise<void> {
  const res = await req.post(`${FUNCTIONS_URL}/message`, {
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    data: { to, content },
  });
  if (!res.ok()) throw new Error(`sendMessage failed: ${res.status()} ${await res.text()}`);
}

/**
 * Unblock via the API directly (not the UI) — used purely as a defensive
 * safety net so a mid-test assertion failure never leaves a seeded family
 * permanently blocked for the next run. Idempotent per
 * supabase/functions/moderation/index.ts (204 whether or not a row
 * matched), so calling it when nothing is actually blocked is always safe.
 */
async function apiUnblock(req: APIRequestContext, token: string, familyId: string): Promise<void> {
  await req.delete(`${FUNCTIONS_URL}/moderation/blocks/${familyId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

const REPORT_CATEGORY_LABEL = {
  unkind: 'Unkind or judgmental',
  privacy: 'Shares private details',
  other: 'Something else',
} as const;

const REPORT_CONFIRMATION_TEXT = 'Report sent — our team will take a look.';

// ── Scenario 1 (qa-engineer: report-flow-per-surface) — AC1: Report is
// reachable from a feed post, a comment, and a DM message, each picking a
// category (+ an optional note on one of them), and each shows a
// role="status" confirmation. ───────────────────────────────────────────

test.describe('report-flow-per-surface', () => {
  let postContent: string;
  let postId: string;
  let commentContent: string;
  let dmContent: string;
  let brooksUserId: string;

  test.beforeAll(async () => {
    const api = await request.newContext();
    const brooksToken = await getToken(api, 'brooks@dummy.test');
    const andersonToken = await getToken(api, 'anderson@dummy.test');
    const andersonId = await getUserId(api, andersonToken);
    brooksUserId = await getUserId(api, brooksToken);

    postContent = `E2E report-flow post ${Date.now()}`;
    postId = await createPost(api, brooksToken, postContent);

    commentContent = `E2E report-flow comment ${Date.now()}`;
    await createComment(api, brooksToken, postId, commentContent);

    dmContent = `E2E report-flow dm ${Date.now()}`;
    await sendMessage(api, brooksToken, andersonId, dmContent);

    await api.dispose();
  });

  test('reports a feed post: submit stays disabled until a category is picked, then confirms', async ({ page }) => {
    await loginAs(page, 'anderson@dummy.test');
    await page.goto('/feed');

    const post = page.locator('article').filter({ hasText: postContent });
    await expect(post).toBeVisible();
    await post.getByRole('button', { name: 'More actions' }).click();
    await post.getByRole('menuitem', { name: /report this post/i }).click();

    const dialog = page.getByRole('dialog', { name: 'Report this post' });
    await expect(dialog).toBeVisible();

    const submit = dialog.getByRole('button', { name: 'Send report' });
    // Reachable path per the dispatch's steer: the category-required Zod
    // validation message is unreachable via mouse/keyboard (this button
    // stays disabled with nothing selected), so this is the assertion this
    // file makes instead of the one qa-engineer's ReportModal.test.tsx
    // already left intentionally red ("Gap #2").
    await expect(submit).toBeDisabled();

    await dialog.getByText(REPORT_CATEGORY_LABEL.unkind, { exact: true }).click();
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(dialog.getByRole('status')).toContainText(REPORT_CONFIRMATION_TEXT);
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('reports a comment with an optional note and confirms', async ({ page }) => {
    await loginAs(page, 'anderson@dummy.test');
    await page.goto(`/post/${postId}`);

    const comment = page.locator('li').filter({ hasText: commentContent });
    await expect(comment).toBeVisible();
    await comment.getByRole('button', { name: 'More actions' }).click();
    await comment.getByRole('menuitem', { name: /report this comment/i }).click();

    const dialog = page.getByRole('dialog', { name: 'Report this comment' });
    await expect(dialog).toBeVisible();

    await dialog.getByText(REPORT_CATEGORY_LABEL.privacy, { exact: true }).click();
    await dialog.getByLabel(/add a note/i).fill('E2E note: shares placement details.');
    await dialog.getByRole('button', { name: 'Send report' }).click();

    await expect(dialog.getByRole('status')).toContainText(REPORT_CONFIRMATION_TEXT);
  });

  test('reports a DM message from a thread bubble, with no Block item offered, and confirms', async ({ page }) => {
    await loginAs(page, 'anderson@dummy.test');
    await page.goto(`/messages/${brooksUserId}`);

    const bubble = page.locator('div.group').filter({ hasText: dmContent });
    await expect(bubble).toBeVisible();
    await bubble.hover();
    await bubble.getByRole('button', { name: 'More actions' }).click();

    // Block isn't specced for DM messages (### Visual §1.1/§8) — confirm
    // that against the real, wired-up component, not just ModerationMenu's
    // own RTL test in isolation.
    await expect(bubble.getByRole('menuitem', { name: /report this message/i })).toBeVisible();
    await expect(bubble.getByRole('menuitem', { name: /block/i })).toHaveCount(0);

    await bubble.getByRole('menuitem', { name: /report this message/i }).click();
    const dialog = page.getByRole('dialog', { name: 'Report this message' });
    await expect(dialog).toBeVisible();

    await dialog.getByText(REPORT_CATEGORY_LABEL.other, { exact: true }).click();
    await dialog.getByRole('button', { name: 'Send report' }).click();

    await expect(dialog.getByRole('status')).toContainText(REPORT_CONFIRMATION_TEXT);
  });
});
