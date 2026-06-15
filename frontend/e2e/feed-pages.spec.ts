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
});
