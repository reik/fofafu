import { test, expect } from '@playwright/test';
import { loginAs } from './utils/login';

test.describe('messaging', () => {
  test('thread list shows an empty state with no conversations', async ({ page }) => {
    // chen@dummy.test never sends/receives messages in any spec, so this stays
    // accurate across reruns against the persisted e2e.db.
    await loginAs(page, 'chen@dummy.test');
    await page.goto('/messages');

    await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
    await expect(page.getByText('No messages yet.')).toBeVisible();
  });

  test('can start a conversation with another family from their profile', async ({ page }) => {
    await loginAs(page, 'anderson@dummy.test');
    await page.goto('/');
    await page.getByRole('link', { name: /Brooks/i }).first().click();
    await page.getByRole('link', { name: 'Message this family' }).click();

    await expect(page.getByRole('heading', { name: 'Conversation' })).toBeVisible();

    const content = `E2E test message ${Date.now()}`;
    await page.getByLabel('Message', { exact: true }).fill(content);
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText(content)).toBeVisible();
  });
});
