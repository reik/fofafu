import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { loginAs, SEED_PASSWORD } from './utils/login';

/**
 * Covers fofafu_vault/features/header-nav-redesign.md acceptance criteria
 * (Option B — grouped pill track, icon-only links, avatar+name chip):
 *
 *  AC1  Desktop nav renders Home/Family/Messages/Community/Playdates as
 *       icon-only links, all reachable, each navigating to its route.
 *  AC2  The active page's icon carries aria-current="page" (the testable
 *       proxy for the filled "puck" state — see note below) and it's
 *       exclusive to the current route.
 *  AC3  Every icon-only link keeps its aria-label (today's wording) and
 *       reveals a visible tooltip with that label on hover and on focus.
 *  AC4  The Messages icon's aria-label still follows "Messages, N unread"
 *       when there are unread messages.
 *  AC5  The right-hand cluster collapses into one avatar+name chip; Sign
 *       out is not directly exposed but is reachable from the chip (both
 *       by mouse and by keyboard alone — Tab to chip, Enter, Tab, Enter —
 *       per a11y-auditor's blocking Keyboard finding in ### Accessibility),
 *       and actually signs the user out.
 *
 * Deliberately NOT covered here (see ### E2E coverage in the feature file
 * for why each belongs elsewhere):
 *  AC6  Header border 3px -> 2px is a pure visual/style change with no
 *       user-facing behavioral difference — ui-designer/a11y-auditor
 *       visual-review territory, not a DOM/accessibility assertion.
 *  AC7  ":focus-visible" *ring styling* (color/width/offset) is a visual
 *       concern for a11y-auditor. This file proves the controls are
 *       focusable, that aria-current is correct (AC2), that aria-expanded
 *       reflects the chip's open state, and that the chip's disclosure is
 *       fully keyboard-operable (AC5) — not pixel-level outline
 *       verification.
 *  AC8  Navbar.test.tsx / tsc are frontend-dev's + qa-engineer's own gates.
 *
 * IMPLEMENTATION NOTES (verified against the landed Navbar.tsx — this spec
 * was started before frontend-dev's redesign diff existed, then reconciled
 * against the real markup once it landed):
 *  - AC3 tooltip: each NavTrackItem's tooltip is `aria-hidden="true"` (it's
 *    redundant with the link's own aria-label for a11y — the real
 *    accessible name comes from the Link, not the tooltip) and reveal is
 *    opacity-based (`opacity-0` / `group-hover:opacity-100` /
 *    `group-focus-visible:opacity-100`), always mounted, not conditionally
 *    rendered. Two consequences: (1) it's matched by visible text, not
 *    role=tooltip, since aria-hidden strips it from the accessibility tree
 *    entirely — a role-based query would never find it; (2) visibility is
 *    asserted via `toHaveCSS('opacity', ...)`, not `toBeVisible()` —
 *    confirmed empirically that Playwright's visibility check does not
 *    consider computed `opacity` (only display/visibility/zero-size), so
 *    an opacity-0-but-laid-out element reads as "visible" regardless of
 *    hover/focus state.
 *  - AC5 chip: it's a real `<button aria-label="{firstName} account
 *    menu">`. `firstName()` is a naive `name.trim().split(/\s+/)[0]`, and
 *    the seed data's `user.name` is a *family* display name ("The Anderson
 *    Family"), not a personal name — so for anderson@dummy.test this
 *    resolves to "The account menu", not "Anderson account menu". Matched
 *    on the stable "account menu" suffix instead of the family name to
 *    stay correct regardless of that per-family quirk (flagged for
 *    frontend-dev in this file's notes, not fixed here — out of this
 *    spec's writer-ownership).
 *  - AC5 "Sign out": a plain `<button>` (not role=menuitem) inside a
 *    `hidden`-attribute-toggled disclosure — `hidden` maps to `display:
 *    none`, which `toBeVisible()` *does* correctly detect, so the
 *    pre-open "not visible" assertion needed no special-casing.
 *
 * Seed families used (password: "password123", see utils/login.ts):
 *   anderson@dummy.test — primary account for nav/puck/chip/tooltip checks
 *   davis@dummy.test    — unread-badge receiver. Reserved for this in this
 *                          file only: messages-pages.spec.ts already
 *                          reserves chen@dummy.test as the family that
 *                          "never sends/receives messages in any spec", and
 *                          seeds an anderson->brooks thread — neither of
 *                          which touches davis's inbox, so its unread count
 *                          is otherwise untouched. The badge assertion still
 *                          reads davis's count immediately before sending
 *                          and asserts a +1 delta rather than an absolute
 *                          number, so it stays correct even if that
 *                          changes.
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
// Mirrors playdates.spec.ts's pattern of hitting Supabase Auth + the
// deployed Edge Functions directly for setup data, rather than seeding
// through a dead local backend.

async function getToken(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    data: { email, password: SEED_PASSWORD },
  });
  const body = (await res.json()) as { access_token?: string; error?: string; msg?: string };
  if (!body.access_token) throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

/** Resolves a seeded family's auth user id via GoTrue's /user endpoint. */
async function getUserId(request: APIRequestContext, token: string): Promise<string> {
  const res = await request.get(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error(`Could not resolve user id: ${JSON.stringify(body)}`);
  return body.id;
}

async function getUnreadCount(request: APIRequestContext, token: string): Promise<number> {
  const res = await request.get(`${FUNCTIONS_URL}/message/unread/count`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { count?: number };
  return body.count ?? 0;
}

async function sendMessage(
  request: APIRequestContext,
  token: string,
  to: string,
  content: string,
): Promise<void> {
  const res = await request.post(`${FUNCTIONS_URL}/message`, {
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    data: { to, content },
  });
  if (!res.ok()) throw new Error(`sendMessage failed: ${res.status()} ${await res.text()}`);
}

const NAV_ITEMS = [
  { label: 'Home', path: '/' },
  { label: 'Family', path: '/family/me' },
  { label: 'Messages', path: '/messages' },
  { label: 'Community', path: '/search' },
  { label: 'Playdates', path: '/playdates' },
] as const;

function mainNav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Main navigation' });
}

/**
 * Messages may legitimately carry a "Messages, N unread" aria-label instead
 * of the bare label — match either so nav-wide checks stay accurate
 * regardless of the account's current unread count.
 */
function navLink(nav: Locator, label: string): Locator {
  return label === 'Messages'
    ? nav.getByRole('link', { name: /^Messages/ })
    : nav.getByRole('link', { name: label, exact: true });
}

// ── AC1 + AC2: icon-only links are reachable, navigate correctly, and the
// active page's icon is the only one marked aria-current ───────────────────

test.describe('AC1 + AC2 — nav icons are reachable and mark the active page', () => {
  test('clicking each icon navigates to its route and is the only one aria-current', async ({ page }) => {
    await loginAs(page, 'anderson@dummy.test');
    await page.goto('/');

    const nav = mainNav(page);

    for (const { label, path } of NAV_ITEMS) {
      const link = navLink(nav, label);
      await link.click();
      await expect(page).toHaveURL(path);
      await expect(link).toHaveAttribute('aria-current', 'page');

      for (const other of NAV_ITEMS) {
        if (other.label === label) continue;
        await expect(navLink(nav, other.label)).not.toHaveAttribute('aria-current', 'page');
      }
    }
  });
});

// ── AC3: icon-only links keep their accessible name and reveal a tooltip on
// hover/focus ────────────────────────────────────────────────────────────

test.describe('AC3 — accessible name + hover/focus tooltip on icon-only links', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'anderson@dummy.test');
    await page.goto('/');
  });

  test('each icon has an accessible name but its tooltip stays hidden (opacity 0) by default', async ({ page }) => {
    const nav = mainNav(page);
    for (const { label } of NAV_ITEMS) {
      // Accessible name (from aria-label) is present regardless of hover.
      await expect(navLink(nav, label)).toBeVisible();
      // The tooltip is always mounted (aria-hidden, opacity-driven reveal)
      // rather than conditionally rendered — assert the closed state via
      // computed opacity, not toBeVisible() (see IMPLEMENTATION NOTES).
      await expect(nav.getByText(label, { exact: true })).toHaveCSS('opacity', '0');
    }
  });

  test('hovering the Home icon reveals a visible tooltip with its label', async ({ page }) => {
    const nav = mainNav(page);
    const home = navLink(nav, 'Home');
    const tooltip = nav.getByText('Home', { exact: true });

    await expect(tooltip).toHaveCSS('opacity', '0');
    await home.hover();
    await expect(tooltip).toHaveCSS('opacity', '1');
  });

  test('focusing the Home icon reveals a visible tooltip with its label', async ({ page }) => {
    const nav = mainNav(page);
    const home = navLink(nav, 'Home');
    const tooltip = nav.getByText('Home', { exact: true });

    await expect(tooltip).toHaveCSS('opacity', '0');
    await home.focus();
    await expect(tooltip).toHaveCSS('opacity', '1');
  });
});

// ── AC4: unread badge keeps the "Messages, N unread" aria-label pattern ────

test.describe('AC4 — unread-messages badge on the Messages icon', () => {
  test('shows "Messages, N unread" after receiving a new message', async ({ page, request }) => {
    const davisToken = await getToken(request, 'davis@dummy.test');
    const davisId = await getUserId(request, davisToken);
    const before = await getUnreadCount(request, davisToken);

    const andersonToken = await getToken(request, 'anderson@dummy.test');
    await sendMessage(request, andersonToken, davisId, `E2E nav-badge ${Date.now()}`);

    await loginAs(page, 'davis@dummy.test');
    await page.goto('/');

    const nav = mainNav(page);
    await expect(nav.getByRole('link', { name: `Messages, ${before + 1} unread` })).toBeVisible();
  });
});

// ── AC5: right-hand cluster collapses into an avatar+name chip; sign-out
// stays reachable from it ───────────────────────────────────────────────────

test.describe('AC5 — avatar chip replaces the sign-out button', () => {
  test('sign out is hidden until the chip is opened, then reachable and functional (mouse)', async ({ page }) => {
    await loginAs(page, 'anderson@dummy.test');
    await page.goto('/');

    const nav = mainNav(page);
    const chip = nav.getByRole('button', { name: /account menu/i });
    const signOut = page.getByRole('button', { name: /sign out/i });

    // No longer a standalone, always-visible control — collapsed behind the
    // chip's disclosure (a `hidden`-attribute toggle, i.e. display:none
    // when closed, which toBeVisible() correctly detects).
    await expect(signOut).not.toBeVisible();

    await chip.click();
    await expect(signOut).toBeVisible();
    await signOut.click();

    await expect(page).toHaveURL(/\/login$/);
    // Navbar only renders while authenticated (Layout.tsx: `{token &&
    // <Navbar />}`) — its disappearance confirms sign-out actually cleared
    // the session, not just that a navigation happened.
    await expect(nav).not.toBeVisible();
  });

  // a11y-auditor's Keyboard finding (feature file, ### Accessibility,
  // "Avatar-chip reveal ... must be keyboard-operable"): flagged BLOCKING —
  // a hover-only or click-outside-only reveal with no keyboard open path
  // would make Sign out unreachable for keyboard users (2.1.1 Keyboard) and
  // a regression from today's always-Tab-reachable button. Explicit
  // keyboard-only walkthrough per that finding's own recommended case.
  test('sign out is operable via keyboard alone: Tab to chip, Enter, Tab, Enter', async ({ page }) => {
    await loginAs(page, 'anderson@dummy.test');
    await page.goto('/');

    const nav = mainNav(page);
    const chip = nav.getByRole('button', { name: /account menu/i });

    await chip.focus();
    await expect(chip).toHaveAttribute('aria-expanded', 'false');

    // Opens via Enter, not click-only or hover-only.
    await page.keyboard.press('Enter');
    await expect(chip).toHaveAttribute('aria-expanded', 'true');

    const signOut = page.getByRole('button', { name: /sign out/i });
    await expect(signOut).toBeVisible();

    // Sign out is the next Tab stop and is itself keyboard-activatable.
    await page.keyboard.press('Tab');
    await expect(signOut).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/login$/);
    await expect(nav).not.toBeVisible();
  });
});
