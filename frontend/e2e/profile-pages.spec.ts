import { test, expect } from '@playwright/test';
import { loginAs } from './utils/login';

test.describe('family profile pages', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'anderson@dummy.test');
  });

  test('owner can edit their family page bio', async ({ page }) => {
    await page.goto('/family/me');
    await expect(page.getByRole('heading', { name: 'Your family page' })).toBeVisible();

    await page.getByRole('button', { name: 'Edit page' }).click();

    const bio = `Updated bio from e2e ${Date.now()}`;
    await page.getByLabel('Bio').fill(bio);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText(bio)).toBeVisible();
  });

  test('visiting another family shows a Message this family link', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Brooks/i }).first().click();

    await expect(page.getByRole('link', { name: 'Message this family' })).toBeVisible();
  });
});
