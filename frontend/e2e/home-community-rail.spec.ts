import { test, expect } from '@playwright/test';
import { loginAs } from './utils/login';

test.describe('home community rail', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'anderson@dummy.test');
    await page.goto('/');
  });

  test('clicking directly on a family name navigates to their profile', async ({ page }) => {
    const name = page.getByText('The Chen Family', { exact: true });
    await expect(name).toBeVisible();

    const box = await name.boundingBox();
    if (!box) throw new Error('Could not measure the family name element');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(page.getByRole('heading', { name: /Chen/i })).toBeVisible();
  });

  test('clicking directly on a family avatar navigates to their profile', async ({ page }) => {
    const row = page.locator('li', { hasText: 'The Davis Family' });
    // Seeded families may render either a real avatar image or the initials
    // fallback — match whichever is actually there.
    const avatar = row.locator('img, span[aria-hidden="true"]').first();
    await expect(avatar).toBeVisible();

    const box = await avatar.boundingBox();
    if (!box) throw new Error('Could not measure the avatar element');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(page.getByRole('heading', { name: /Davis/i })).toBeVisible();
  });

  test('the whole row shows a pointer cursor, including over the name text', async ({ page }) => {
    const name = page.getByText('The Brooks Family', { exact: true });
    const box = await name.boundingBox();
    if (!box) throw new Error('Could not measure the family name element');

    const cursor = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? getComputedStyle(el).cursor : null;
    }, [box.x + box.width / 2, box.y + box.height / 2]);

    expect(cursor).toBe('pointer');
  });
});
