import { test, expect } from '@playwright/test';
import { loginAs } from './utils/login';

test.describe('announcements feed', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'brooks@dummy.test');
  });

  test('shows existing posts and lets the family compose a new one', async ({ page }) => {
    await page.goto('/feed');

    await expect(page.getByRole('heading', { name: 'Announcements' })).toBeVisible();
    await expect(page.locator('article').first()).toBeVisible();

    const content = `E2E test post ${Date.now()}`;
    await page.getByLabel("What's going on?").fill(content);
    await page.getByRole('button', { name: 'Post', exact: true }).click();

    await expect(page.getByText(content)).toBeVisible();
  });

  test('new posts appear at the top of the feed, newest-first', async ({ page }) => {
    await page.goto('/feed');

    await expect(page.locator('article').first()).toBeVisible();

    const content = `E2E ordering post ${Date.now()}`;
    await page.getByLabel("What's going on?").fill(content);
    await page.getByRole('button', { name: 'Post', exact: true }).click();

    // The new post must land in the feed, mounted within the top few cards
    // of the (possibly virtualized) list — i.e. treated as one of the
    // newest items, not appended at the bottom or buried. A small window
    // tolerates other posts created in the same second by sibling specs
    // running concurrently against the shared e2e.db (createdAt has
    // second-level precision with no secondary sort key).
    const topArticles = page.locator('article');
    await expect(async () => {
      const texts = await topArticles.allInnerTexts();
      const top = texts.slice(0, 5);
      expect(top.some((t) => t.includes(content))).toBe(true);
    }).toPass({ timeout: 10_000 });
  });

  test('reacting to a post toggles the reaction state and count', async ({ page }) => {
    await page.goto('/feed');

    await expect(page.locator('article').first()).toBeVisible();

    // Compose a fresh post so its reaction state starts deterministic
    // (no reactions, myReaction unset) instead of depending on/mutating
    // seeded reaction state shared with other specs.
    const content = `E2E reaction post ${Date.now()}`;
    await page.getByLabel("What's going on?").fill(content);
    await page.getByRole('button', { name: 'Post', exact: true }).click();

    const newCard = page.locator('article').filter({ hasText: content });
    await expect(newCard).toBeVisible();

    const loveButton = newCard.getByRole('button', { name: 'Love' });
    await expect(loveButton).toHaveAttribute('aria-pressed', 'false');

    await loveButton.click();

    await expect(loveButton).toHaveAttribute('aria-pressed', 'true');
    await expect(loveButton).toContainText('1');
  });

  test('the feed list is virtualized: only a subset of cards are mounted', async ({ page }) => {
    await page.goto('/feed');

    const virtualList = page.getByTestId('feed-virtual-list');
    await expect(virtualList).toBeVisible();
    await expect(virtualList).toHaveAttribute('role', 'feed');

    // The first page has 20 items (seed data: 36 posts total, limit=20), but
    // the virtualizer should mount only the visible + overscan window, not
    // all 20 at once.
    const mountedItems = page.getByTestId('feed-virtual-item');
    const mountedCount = await mountedItems.count();
    expect(mountedCount).toBeGreaterThan(0);
    expect(mountedCount).toBeLessThan(20);

    // Every mounted virtual item wraps a real AnnouncementCard (role="article").
    await expect(mountedItems.first().getByRole('article')).toBeVisible();
  });

  test('loading older posts accumulates more cards into the virtualized list', async ({ page }) => {
    await page.goto('/feed');

    await expect(page.locator('article').first()).toBeVisible();

    const virtualList = page.getByTestId('feed-virtual-list');
    const initialHeight = await virtualList.evaluate((el) => el.getBoundingClientRect().height);

    const loadOlderButton = page.getByRole('button', { name: 'Load older posts' });

    // The seed data (36 posts across families, 20 per page) guarantees a
    // second page exists, but the button may be below the fold of the
    // virtualized window — scroll it into view before asserting/clicking.
    await loadOlderButton.scrollIntoViewIfNeeded();
    await expect(loadOlderButton).toBeVisible();

    await loadOlderButton.click();

    // Pagination accumulates rather than replaces: the virtualizer's total
    // size (driven by items.length) must grow once the second page lands.
    await expect(async () => {
      const height = await virtualList.evaluate((el) => el.getBoundingClientRect().height);
      expect(height).toBeGreaterThan(initialHeight);
    }).toPass({ timeout: 10_000 });

    // The feed remains on the same route with the heading still present —
    // pagination does not navigate away or reset the composer.
    await expect(page.getByRole('heading', { name: 'Announcements' })).toBeVisible();
    await expect(page.getByLabel("What's going on?")).toBeVisible();
  });

  test('scrolling through the feed brings later cards into the DOM', async ({ page }) => {
    await page.goto('/feed');

    const firstCard = page.locator('article').first();
    await expect(firstCard).toBeVisible();
    const firstCardTextBefore = await firstCard.innerText();

    // Scroll down repeatedly so a virtualized list mounts cards further down
    // the feed (overscan window moves with scroll position).
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 1200);
      await page.waitForTimeout(150);
    }

    const visibleArticles = page.locator('article');
    await expect(visibleArticles.first()).toBeVisible();

    // After scrolling, at least one article must still be rendered, the page
    // must not have gone blank, and the visible content should have changed
    // (different cards mounted further down the feed).
    const articleCount = await visibleArticles.count();
    expect(articleCount).toBeGreaterThan(0);

    const someCardText = await visibleArticles.first().innerText();
    expect(someCardText.length).toBeGreaterThan(0);
    expect(someCardText).not.toEqual(firstCardTextBefore);
  });
});
