import { test, expect, type Page, type Route } from '@playwright/test';
import { loginAs } from './utils/login';

// Assumed test-hook contract for [[features/feed-skeleton-loading]] — written
// against the acceptance criteria before frontend-dev's implementation had
// landed in this worktree (parallel dispatch; see feature file notes). If the
// shipped markup uses different hooks, update the selectors below rather than
// the assertions — the assertions encode the ACs themselves:
//   - `[aria-busy="true"]` on the section/list wrapper while its query is
//     pending, cleared once data resolves (ACs: aria-busy lifecycle).
//   - `data-testid="announcement-card-skeleton"` on each skeleton card
//     (mirrors the suggested `AnnouncementCardSkeleton` component), each
//     `aria-hidden="true"` and containing no focusable descendants.
//   - `data-testid="announcement-card-skeleton-media"` nested in at least one
//     skeleton card (the media-block variant).
//   - `data-testid="community-skeleton-row"` for the Community rail's
//     skeleton rows.
//
// These specs intercept the real Supabase Edge Function calls to artificially
// delay their response (`page.route` + `route.continue()` after a gate
// resolves) so the skeleton state is observable — this is still an
// end-to-end test against real data, just with real-world network timing
// slowed down enough to assert against, per the "real network timing"
// guidance for this feature.

async function delayRoute(page: Page, urlPattern: string) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(urlPattern, async (route: Route) => {
    await gate;
    await route.continue();
  });
  return release;
}

function focusableDescendants(page: Page, testId: string) {
  return page
    .getByTestId(testId)
    .locator('a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
}

test.describe('feed skeleton loading', () => {
  test('home feed: shows skeleton cards while pending, then swaps to real content and clears aria-busy', async ({
    page,
  }) => {
    const releaseFeed = await delayRoute(page, '**/announcement*');

    await loginAs(page, 'brooks@dummy.test');

    const skeletons = page.getByTestId('announcement-card-skeleton');
    await expect(skeletons.first()).toBeVisible();
    expect(await skeletons.count()).toBeGreaterThanOrEqual(2);
    expect(await skeletons.count()).toBeLessThanOrEqual(3);

    // At least one skeleton card carries a media placeholder block.
    await expect(page.getByTestId('announcement-card-skeleton-media').first()).toBeVisible();

    // The feed section is marked busy while the skeleton stands in.
    await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();

    // Skeleton blocks are hidden from assistive tech and introduce no
    // focusable descendants — no extra tab stops while loading.
    await expect(skeletons.first()).toHaveAttribute('aria-hidden', 'true');
    expect(await focusableDescendants(page, 'announcement-card-skeleton').count()).toBe(0);

    releaseFeed();

    await expect(page.getByTestId('announcement-card-skeleton')).toHaveCount(0);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('home feed: tabbing while pending never focuses inside a skeleton block', async ({ page }) => {
    const releaseFeed = await delayRoute(page, '**/announcement*');

    await loginAs(page, 'anderson@dummy.test');

    await expect(page.getByTestId('announcement-card-skeleton').first()).toBeVisible();

    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const focusedInsideSkeleton = await page.evaluate(
        () => !!document.activeElement?.closest('[data-testid="announcement-card-skeleton"]'),
      );
      expect(focusedInsideSkeleton).toBe(false);
    }

    releaseFeed();
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('home community rail: shows skeleton rows while pending, then swaps to real rows', async ({ page }) => {
    const releaseCommunity = await delayRoute(page, '**/community/recent*');

    await loginAs(page, 'davis@dummy.test');

    const communitySection = page.getByRole('complementary', { name: 'Community' });
    await expect(communitySection).toBeVisible();

    const skeletonRows = page.getByTestId('community-skeleton-row');
    await expect(skeletonRows.first()).toBeVisible();
    await expect(skeletonRows.first()).toHaveAttribute('aria-hidden', 'true');

    releaseCommunity();

    await expect(page.getByTestId('community-skeleton-row')).toHaveCount(0);
    await expect(communitySection.getByText('The Chen Family', { exact: true })).toBeVisible();
  });

  test('/feed: shows skeleton cards on initial load, then swaps to real content', async ({ page }) => {
    const releaseFeed = await delayRoute(page, '**/announcement*');

    await loginAs(page, 'brooks@dummy.test');
    await page.goto('/feed');

    const skeletons = page.getByTestId('announcement-card-skeleton');
    await expect(skeletons.first()).toBeVisible();
    await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();

    releaseFeed();

    await expect(page.getByTestId('announcement-card-skeleton')).toHaveCount(0);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('/feed: "Load older posts" pagination does not re-show the initial-load skeleton', async ({ page }) => {
    await loginAs(page, 'brooks@dummy.test');
    await page.goto('/feed');

    await expect(page.locator('article').first()).toBeVisible();
    await expect(page.getByTestId('announcement-card-skeleton')).toHaveCount(0);

    // Delay only the *next* page fetch (the cursor-bearing request), triggered
    // by clicking "Load older posts" — the AC restricts the skeleton to
    // `isPending && cursor === null`, so this second, cursor !== null fetch
    // must NOT bring the skeleton back.
    const releaseNextPage = await delayRoute(page, '**/announcement*cursor=*');

    const loadOlderButton = page.getByRole('button', { name: 'Load older posts' });
    await loadOlderButton.scrollIntoViewIfNeeded();
    await expect(loadOlderButton).toBeVisible();
    await loadOlderButton.click();

    // While that second page is in flight, no full skeleton cards should
    // appear anywhere in the list.
    expect(await page.getByTestId('announcement-card-skeleton').count()).toBe(0);

    releaseNextPage();

    await expect(page.locator('article').first()).toBeVisible();
  });

  test('reduced motion: skeleton bones render statically, no pulse/shimmer animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const releaseFeed = await delayRoute(page, '**/announcement*');
    await loginAs(page, 'anderson@dummy.test');

    const firstSkeleton = page.getByTestId('announcement-card-skeleton').first();
    await expect(firstSkeleton).toBeVisible();

    const animationName = await firstSkeleton.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toBe('none');

    releaseFeed();
    await expect(page.locator('article').first()).toBeVisible();
  });
});
