import { test, expect } from '@playwright/test';
import { loginAs } from './utils/login';

test.describe('community search', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'anderson@dummy.test');
    await page.goto('/search');
  });

  test('rejects queries under 2 characters', async ({ page }) => {
    await page.getByLabel('Search').fill('a');
    await page.getByRole('button', { name: 'Search' }).click();

    await expect(page.getByText('At least 2 characters.')).toBeVisible();
  });

  test('finds a family by name and links to their profile', async ({ page }) => {
    await page.getByLabel('Search').fill('Chen');
    await page.getByRole('button', { name: 'Search' }).click();

    const result = page.getByRole('link').filter({ hasText: 'The Chen Family' });
    await expect(result).toBeVisible();

    await result.click();
    await expect(page.getByRole('heading', { name: /Chen/i })).toBeVisible();
  });
});
