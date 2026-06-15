import type { Page } from '@playwright/test';

/** Password for every dummy family seeded by backend/scripts/seed-dummy.ts */
export const SEED_PASSWORD = 'password123';

/** Logs in via the UI as one of the seeded dummy families and waits for the redirect to "/". */
export async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/');
}
