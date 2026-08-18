import { test, expect } from '@playwright/test';
import { loginAs } from './utils/login';

// Requires REPLY_COACH_ENABLED=true set as a secret on the target Supabase
// project's Edge Functions. This repo has no local backend left to configure
// it on (see playwright.config.ts — the Express webServer entry was removed
// during the Render->Supabase migration; e2e now runs against the live
// project). If the flag is off there, the coach Edge Function 404s and this
// test fails at the "chip appears" assertion.
test.describe('comment composer — reply coach', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'brooks@dummy.test');
  });

  test('suggests a softer rewrite and lets the author accept it before posting', async ({ page }) => {
    await page.goto('/feed');
    await page.locator('article').first().getByRole('link', { name: 'Open' }).click();

    const textarea = page.getByLabel('Add a comment');
    await textarea.fill('At least you got to keep her for a while.');
    await textarea.blur(); // triggerNow — avoids waiting on the 600ms debounce

    const chip = page.getByRole('region', { name: 'Suggested rewrite' });
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("The time you had with her mattered, and I'm sorry it's ending this way.");

    await chip.getByRole('button', { name: 'Use this' }).click();
    await expect(textarea).toHaveValue("The time you had with her mattered, and I'm sorry it's ending this way.");
    await expect(chip).not.toBeVisible();

    await page.getByRole('button', { name: 'Comment' }).click();
    await expect(page.getByText("The time you had with her mattered")).toBeVisible();
  });
});
