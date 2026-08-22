import { describe, it, expect } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/tests/render';
import { server, handlers } from '@/tests/msw-server';
import { expectNoA11yViolations } from '@/tests/a11y';
import { useAuthStore } from '@/stores/auth';
import { Navbar } from './Navbar';

/**
 * Coverage for fofafu_vault/features/header-nav-redesign.md (Option B, "Grouped
 * Track"). This file is additive to Navbar.test.tsx (owned by frontend-dev for
 * its own structural updates) — it targets the acceptance criteria that need
 * dedicated a11y/behavior assertions: icon-only rendering with a real
 * aria-label (per a11y-auditor's ### Accessibility audit, desktop links had
 * *no* aria-label before this feature — only mobile did), the active "puck",
 * the unread-badge aria-label pattern, the avatar+name chip replacing the
 * name/location/sign-out cluster (including the audit's blocking findings:
 * keyboard-operable + Escape-closeable reveal, and the avatar initial on an
 * accessible-contrast token), and keyboard/focus-visible reachability.
 *
 * The chip shows the full `user.name`, truncated past 24 chars — not a
 * "first name" extraction. `user.name` in this app is a household display
 * name ("The Anderson Family"), not a person's name, so there's no first-name
 * token to safely take (see commit 1bd5833 / the ### Test plan subsection in
 * fofafu_vault/features/header-nav-redesign.md for the history: an earlier
 * revision of both this file and Navbar.tsx assumed a personal-name split,
 * which produced "The" for every real account).
 *
 * Reconciled against frontend-dev's actual implementation (not just the
 * Reference spec) as of this revision — see inline notes where the shipped
 * code diverges from an earlier assumption in this file:
 * - The hover/focus tooltip is a same-text `aria-hidden="true"` <span> *inside*
 *   the <Link>, shown via `group-hover`/`group-focus-visible`, not a separate
 *   node wired with `aria-describedby`. That's a legitimate alternative to
 *   what this file originally assumed — the link's own `aria-label` already
 *   supplies the accessible name, so hiding the redundant tooltip text from
 *   the accessibility tree avoids double-announcing it to screen readers.
 *
 * Known jsdom limitations (see src/tests/a11y.ts for the precedent):
 * - No real CSS cascade is applied, so anything gated purely by Tailwind
 *   classes (hover/focus-visible rings, `md:hidden`, tooltip show/hide via
 *   opacity) cannot be verified by computed style here. Where the acceptance
 *   criteria is fundamentally visual, this file asserts the closest testable
 *   DOM-level contract (attributes, roles, class-name presence, focus order)
 *   and defers pixel/contrast confirmation to design/a11y-auditor review.
 * - `nav[aria-label="Mobile navigation"]` is *not* CSS-hidden in jsdom (no
 *   `display:none` from `md:hidden` is computed), so its links remain
 *   technically focusable in this environment even though production users at
 *   desktop widths never see them. Tests that assert Tab order stop counting
 *   before reaching the mobile nav rather than asserting it's unreachable.
 */

const DESKTOP_NAV_NAME = /^main navigation$/i;
const MOBILE_NAV_NAME = /^mobile navigation$/i;

/**
 * Text content an assistive-tech user would perceive from `el`'s subtree —
 * i.e. `el.textContent` with every `aria-hidden="true"` branch pruned first.
 * Used to assert "icon-only" (no *accessible* text label) without being
 * tripped up by a sighted-only tooltip/badge span that's correctly hidden
 * from the a11y tree via aria-hidden.
 */
function accessibleTextContent(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
  return clone.textContent?.trim() ?? '';
}

const LINKS: Array<{ label: string; href: string }> = [
  { label: 'Home', href: '/' },
  { label: 'Family', href: '/family/me' },
  { label: 'Messages', href: '/messages' },
  { label: 'Community', href: '/search' },
  { label: 'Playdates', href: '/playdates' },
];

function setAuthed() {
  // Two-word name deliberately: the chip renders user.name in full (this
  // app's names are household display names, not personal ones — there's no
  // "first name" to extract), so a single-word fixture couldn't distinguish
  // "shows the whole name" from "accidentally still splits off one token."
  useAuthStore.getState().setAuth({
    token: 'jwt',
    user: { id: 'u1', email: 'a@b.com', name: 'Jane Ramirez', city: 'Phoenix', state: 'AZ' },
  });
}

function desktopNav() {
  return screen.getByRole('navigation', { name: DESKTOP_NAV_NAME });
}

describe('Navbar — Option B grouped track', () => {
  describe('icon-only rendering keeps unchanged accessible names', () => {
    it.each(LINKS)('"$label" link: correct href, aria-label carries the name, no persistent visible text label', ({ label, href }) => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      renderWithProviders(<Navbar />, { route: '/' });

      const link = within(desktopNav()).getByRole('link', { name: label });

      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('aria-label', label);
      // Icon-only: nothing inside the link is accessible-text content — the
      // icon is aria-hidden, and any sighted-only tooltip/badge text is too.
      // The link's own aria-label is the sole accessible-name source.
      expect(accessibleTextContent(link)).toBe('');
    });

    it('groups all five links inside one shared pill track container', () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      renderWithProviders(<Navbar />, { route: '/' });

      const nav = desktopNav();
      const links = LINKS.map(({ label }) => within(nav).getByRole('link', { name: label }));
      const parents = new Set(links.map((l) => l.parentElement));

      expect(parents.size).toBe(1);
    });
  });

  describe('hover/focus tooltip preserves the information the removed text carried', () => {
    it.each(LINKS)(
      '"$label" link renders a same-text tooltip, correctly hidden from the a11y tree so it does not double-announce the aria-label',
      ({ label }) => {
        setAuthed();
        server.use(handlers.messagesUnreadCount(0));
        renderWithProviders(<Navbar />, { route: '/' });

        const link = within(desktopNav()).getByRole('link', { name: label });

        // `title` only shows on mouse hover in most browsers, never on
        // keyboard focus — insufficient for "hover/focus tooltip".
        expect(link).not.toHaveAttribute('title');

        // The tooltip text must exist (for sighted hover/focus users) —
        // implemented as an aria-hidden span, since the link's own
        // aria-label already supplies the accessible name for AT users.
        const tooltip = Array.from(link.querySelectorAll('[aria-hidden="true"]')).find(
          (el) => el.textContent?.trim().toLowerCase() === label.toLowerCase(),
        );
        expect(tooltip).toBeDefined();
        expect(tooltip).toHaveAttribute('aria-hidden', 'true');

        // Must respond to real keyboard focus (focus-visible), not just
        // :hover — otherwise keyboard users lose the sighted-only affordance
        // entirely, failing the "hover/focus" half of the acceptance criterion.
        expect(tooltip?.className).toMatch(/group-hover:/);
        expect(tooltip?.className).toMatch(/group-focus-visible:/);
      },
    );
  });

  describe('active-page puck', () => {
    it.each(LINKS)('on $href, only "$label" carries aria-current="page"', ({ label, href }) => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      renderWithProviders(<Navbar />, { route: href });

      const nav = desktopNav();
      const active = within(nav).getByRole('link', { name: label });
      expect(active).toHaveAttribute('aria-current', 'page');

      LINKS.filter((l) => l.label !== label).forEach(({ label: otherLabel }) => {
        expect(within(nav).getByRole('link', { name: otherLabel })).not.toHaveAttribute('aria-current');
      });
    });

    it('gives the active link a filled brand-primary treatment distinct from inactive siblings (not surface-warm)', () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      renderWithProviders(<Navbar />, { route: '/family/me' });

      const nav = desktopNav();
      const active = within(nav).getByRole('link', { name: 'Family' });
      const inactive = within(nav).getByRole('link', { name: 'Home' });

      expect(active.className).toMatch(/\bbg-brand-primary\b/);
      expect(active.className).not.toMatch(/bg-surface-warm/);
      expect(active.className).not.toBe(inactive.className);
    });
  });

  describe('unread badge on Messages', () => {
    it('exposes "Messages, N unread" as an accessible name inside the main nav when count > 0', async () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(3));
      renderWithProviders(<Navbar />, { route: '/' });

      const labelled = await within(desktopNav()).findAllByLabelText(/messages, 3 unread/i);
      expect(labelled.length).toBeGreaterThan(0);
    });

    it('does not mention "unread" anywhere in the main nav when count is 0', () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      renderWithProviders(<Navbar />, { route: '/' });

      const nav = desktopNav();
      expect(within(nav).getByRole('link', { name: 'Messages' })).toBeInTheDocument();
      expect(within(nav).queryByText(/unread/i)).not.toBeInTheDocument();
    });
  });

  describe('avatar + name chip replaces the name/location/sign-out cluster', () => {
    // Was "first name only" in an earlier revision — reverted per commit
    // 1bd5833 ("show full household name on nav chip, not first-name split").
    // user.name is a household display name in this app ("The Anderson
    // Family"), not a personal name, so extracting a first token produced
    // "The" for every real account. The chip now shows the *full* name
    // (matching what the pre-redesign header already showed), truncated past
    // 24 chars rather than split.
    it('renders exactly one chip with the full household name, truncated — no separate city/state text', () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      renderWithProviders(<Navbar />, { route: '/' });

      expect(screen.queryByText(/Phoenix,?\s*AZ/i)).not.toBeInTheDocument();

      const name = screen.getByText('Jane Ramirez');
      expect(name).toBeInTheDocument();
      // Plain substring, not a \b-bounded regex: `]` and the space after it
      // are both non-word characters, so a trailing \b can never match there.
      expect(name.className).toContain('max-w-[24ch]');
      expect(name.className).toMatch(/\btruncate\b/);

      const chips = screen.getAllByRole('button', { name: /jane ramirez/i });
      expect(chips).toHaveLength(1);
    });

    it('reveals a Sign out control via the keyboard (Tab to chip, Enter) that preserves clear+redirect behavior', async () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      const user = userEvent.setup();
      renderWithProviders(
        <Routes>
          <Route path="/" element={<Navbar />} />
          <Route path="/login" element={<div>login screen</div>} />
        </Routes>,
        { route: '/' },
      );

      const chip = screen.getByRole('button', { name: /jane/i });
      chip.focus();
      expect(document.activeElement).toBe(chip);

      await user.keyboard('{Enter}');
      const signOut = await screen.findByRole('button', { name: /sign out/i });

      await user.click(signOut);

      expect(useAuthStore.getState().token).toBeNull();
      expect(await screen.findByText(/login screen/i)).toBeInTheDocument();
    });

    // a11y-auditor ### Accessibility, Blocking #1: white text directly on
    // `brand.primary` measures 3.66:1, failing 1.4.3 (needs 4.5:1). The
    // documented fix is `brand.primary.pressed` (4.86:1, already used
    // elsewhere for accessible white-text pairs) — lock it in so a future
    // refactor can't silently regress back to the failing pair.
    it('renders the avatar initial on the accessible brand-primary-pressed token, not the WCAG-failing plain brand-primary', () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      renderWithProviders(<Navbar />, { route: '/' });

      const chip = screen.getByRole('button', { name: /jane/i });
      const initial = within(chip).getByText('J');

      expect(initial.className).toMatch(/\bbg-brand-primary-pressed\b/);
      expect(initial.className).toMatch(/\btext-white\b/);
    });

    // a11y-auditor ### Accessibility, Semantics: the chip trigger needs
    // aria-expanded reflecting open/closed state (or aria-haspopup, if a full
    // menu widget) so screen-reader users know it toggles something.
    it('reflects open/closed state via aria-expanded on the chip trigger', async () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      const user = userEvent.setup();
      renderWithProviders(<Navbar />, { route: '/' });

      const chip = screen.getByRole('button', { name: /jane/i });
      expect(chip).toHaveAttribute('aria-expanded', 'false');

      await user.click(chip);
      expect(chip).toHaveAttribute('aria-expanded', 'true');

      const controlsId = chip.getAttribute('aria-controls');
      expect(controlsId).toBeTruthy();
      expect(controlsId ? document.getElementById(controlsId) : null).not.toBeNull();
    });

    // a11y-auditor ### Accessibility, Keyboard, Blocking #3: the reveal "must
    // clear all of: opens via Enter/Space ..., closes via Escape and returns
    // focus to the chip trigger, and Sign out is reachable ... via keyboard
    // alone." Split into two assertions below.
    it('closes the reveal on Escape', async () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      const user = userEvent.setup();
      renderWithProviders(<Navbar />, { route: '/' });

      const chip = screen.getByRole('button', { name: /jane/i });
      await user.click(chip);
      await screen.findByRole('button', { name: /sign out/i });

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
      expect(chip).toHaveAttribute('aria-expanded', 'false');
    });

    it('returns focus to the chip trigger after closing on Escape', async () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      const user = userEvent.setup();
      renderWithProviders(<Navbar />, { route: '/' });

      const chip = screen.getByRole('button', { name: /jane/i });
      await user.click(chip);
      const signOut = await screen.findByRole('button', { name: /sign out/i });
      signOut.focus();
      expect(document.activeElement).toBe(signOut);

      await user.keyboard('{Escape}');

      expect(document.activeElement).toBe(chip);
    });
  });

  describe('header chrome', () => {
    it('uses a 2px (not 3px) brand-primary bottom border on the main nav', () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      renderWithProviders(<Navbar />, { route: '/' });

      const nav = desktopNav();
      expect(nav.className).not.toMatch(/border-b-\[3px\]/);
      expect(nav.className).toMatch(/border-b-(2\b|\[2px\])/);
      expect(nav.className).toMatch(/border-brand-primary/);
    });
  });

  describe('keyboard + focus-visible reachability', () => {
    it('reaches every desktop control by Tab, in DOM order: brand mark, 5 track links, avatar chip', async () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      const user = userEvent.setup();
      renderWithProviders(<Navbar />, { route: '/' });

      const nav = desktopNav();
      const expectedOrder = [
        screen.getByRole('link', { name: /fofafu home/i }),
        ...LINKS.map(({ label }) => within(nav).getByRole('link', { name: label })),
        screen.getByRole('button', { name: /jane/i }),
      ];

      for (const el of expectedOrder) {
        await user.tab();
        expect(document.activeElement).toBe(el);
      }
    });

    it('keeps every track link and the avatar chip in the natural tab order (no tabindex="-1" traps)', () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      renderWithProviders(<Navbar />, { route: '/' });

      const nav = desktopNav();
      const controls = [
        ...LINKS.map(({ label }) => within(nav).getByRole('link', { name: label })),
        screen.getByRole('button', { name: /jane/i }),
      ];

      controls.forEach((el) => expect(el).not.toHaveAttribute('tabindex', '-1'));
    });

    it('carries a focus-visible styling hook on every track link and the avatar chip', () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      renderWithProviders(<Navbar />, { route: '/' });

      const nav = desktopNav();
      const controls = [
        ...LINKS.map(({ label }) => within(nav).getByRole('link', { name: label })),
        screen.getByRole('button', { name: /jane/i }),
      ];

      controls.forEach((el) => expect(el.className).toMatch(/focus-visible:/));
    });

    it('has no axe-core violations when authenticated with an unread badge present', async () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(2));
      const { container } = renderWithProviders(<Navbar />, { route: '/messages' });

      await within(desktopNav()).findAllByLabelText(/messages, 2 unread/i);
      await expectNoA11yViolations(container);
    });
  });

  describe('mobile nav is unaffected (this redesign is desktop-header-only)', () => {
    it('still shows a visible text label alongside the icon for every link in the mobile tab bar', () => {
      setAuthed();
      server.use(handlers.messagesUnreadCount(0));
      renderWithProviders(<Navbar />, { route: '/' });

      const mobileNav = screen.getByRole('navigation', { name: MOBILE_NAV_NAME });
      LINKS.forEach(({ label }) => {
        expect(within(mobileNav).getByText(label)).toBeInTheDocument();
      });
    });
  });
});
