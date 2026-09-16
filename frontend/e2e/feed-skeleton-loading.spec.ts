import { test, expect } from '@playwright/test';
import { loginAs } from './utils/login';

/**
 * The announcement/community fetches normally resolve fast enough (real
 * Supabase Edge Functions, not a mocked slow backend — see
 * playwright.config.ts) that the skeleton state is a synchronous-render race:
 * without help, Playwright can navigate straight past it before an assertion
 * ever runs. We widen that window deterministically by delaying the relevant
 * network response via page.route(), rather than relying on timing luck.
 *
 * Selectors below are keyed to frontend-dev's actual landed implementation
 * (read directly from `frontend/src/features/feed/components/
 * AnnouncementCardSkeleton.tsx`, `AnnouncementFeedSkeleton.tsx`,
 * `components/Skeleton/Skeleton.tsx`, `components/CommunitySkeleton/*`).
 * Stable hooks added during implementation:
 *   - Skeleton card root: `data-testid="announcement-card-skeleton"`.
 *   - Media placeholder bone: `data-testid="skeleton-media"`.
 *   - Community row root: `data-testid="community-row-skeleton"`.
 * The assertions still use class-based selectors (`[aria-hidden="true"].shadow-lift`,
 * `.h-40`) because they are independent of test-id churn and are visually anchored
 * to the same Tailwind tokens the component itself consumes.
 *   - Ancestor `aria-busy` is a literal `"true"`/`"false"` string (React
 *     renders boolean aria-* props as strings, never omits them).
 *   - Community rows: row-level anatomy is covered by `CommunityRowSkeleton.test.tsx`
 *     in RTL; this suite just asserts "Loading…" is gone and the rail swaps to
 *     real family content.
 */

async function delayNetworkResponse(page: import('@playwright/test').Page, urlGlob: string, ms: number) {
  await page.route(urlGlob, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

test.describe('feed skeleton loading', () => {
  test('home page shows skeleton cards while the feed loads, then swaps to real cards', async ({ page }) => {
    await delayNetworkResponse(page, '**/functions/v1/announcement*', 1500);

    await loginAs(page, 'anderson@dummy.test');

    const feedSection = page.getByRole('region', { name: 'Announcements' });
    await expect(feedSection).toHaveAttribute('aria-busy', 'true');
    await expect(feedSection.getByText('Loading…')).toHaveCount(0);

    const skeletonCards = feedSection.locator('[aria-hidden="true"].shadow-lift');
    await expect(async () => {
      const count = await skeletonCards.count();
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(3);
    }).toPass({ timeout: 2_000 });

    // At least one skeleton card carries a media placeholder (posts may carry images).
    await expect(feedSection.locator('[aria-hidden="true"].h-40').first()).toBeVisible();

    // No real cards mounted yet — only skeleton bones.
    await expect(feedSection.getByRole('article')).toHaveCount(0);

    // Once the delayed response resolves, real cards replace the skeleton
    // and the section is no longer marked busy.
    await expect(feedSection.getByRole('article').first()).toBeVisible({ timeout: 5_000 });
    await expect(feedSection).toHaveAttribute('aria-busy', 'false');
    await expect(skeletonCards).toHaveCount(0);
  });

  test('feed page shows skeleton cards on initial load, then swaps to real cards', async ({ page }) => {
    await delayNetworkResponse(page, '**/functions/v1/announcement*', 1500);

    await loginAs(page, 'brooks@dummy.test');
    await page.goto('/feed');
    await expect(page.getByRole('heading', { name: 'Announcements' })).toBeVisible();

    // The nearest ancestor marked aria-busy is "true" while the initial page loads.
    const busyRegion = page.locator('[aria-busy="true"]').first();
    await expect(busyRegion).toBeVisible();

    const skeletonCards = busyRegion.locator('[aria-hidden="true"].shadow-lift');
    await expect(async () => {
      const count = await skeletonCards.count();
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(3);
    }).toPass({ timeout: 2_000 });
    await expect(page.getByText('Loading…')).toHaveCount(0);
    await expect(page.getByRole('article')).toHaveCount(0);

    // Real cards land once the delayed fetch resolves, and busy state clears.
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  });

  test('community rail shows skeleton rows (not "Loading…") while it loads, then real families', async ({ page }) => {
    await delayNetworkResponse(page, '**/functions/v1/community*', 1500);

    await loginAs(page, 'davis@dummy.test');

    const communityRail = page.getByRole('complementary', { name: 'Community' });
    await expect(communityRail).toBeVisible();
    await expect(communityRail.getByText('Loading…')).toHaveCount(0);

    // At least a couple of aria-hidden skeleton bones stand in for the rows
    // while the request is delayed.
    await expect(async () => {
      const boneCount = await communityRail.locator('[aria-hidden="true"]').count();
      expect(boneCount).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 2_000 });

    // Once the delayed response resolves, a real seeded family name appears.
    await expect(communityRail.getByText(/family/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('post detail page shows a single skeleton card while the post loads (open-question item, resolved yes)', async ({ page }) => {
    await loginAs(page, 'chen@dummy.test');
    await page.goto('/feed');

    const firstOpenLink = page.getByRole('article').first().getByRole('link', { name: 'Open' });
    await expect(firstOpenLink).toBeVisible();
    const href = await firstOpenLink.getAttribute('href');
    if (!href) throw new Error('Could not resolve a seeded post id from the feed');

    // Single-post GETs are path-scoped (…/announcement/:id), distinct from the
    // list GET's query-string form (…/announcement?...) — only delay the former.
    await delayNetworkResponse(page, '**/functions/v1/announcement/*', 1500);
    await page.goto(href);

    const skeletonCards = page.locator('[aria-hidden="true"].shadow-lift');
    await expect(skeletonCards).toHaveCount(1);
    await expect(page.getByText('Loading…')).toHaveCount(0);

    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 5_000 });
    await expect(skeletonCards).toHaveCount(0);
  });
});
