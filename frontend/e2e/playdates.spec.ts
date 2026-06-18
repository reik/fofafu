import { test, expect, type APIRequestContext } from '@playwright/test';
import { loginAs, SEED_PASSWORD } from './utils/login';

/**
 * Covers vault/features/playdates.md acceptance criteria:
 *  AC1  /playdates page is accessible after login — shows calendar + requests sidebar
 *  AC2  User can add an availability slot
 *  AC3  User can edit an existing slot
 *  AC4  User can delete a slot
 *  AC5  /family/:id shows another family's free slots read-only
 *  AC6  From another family's free slot, user can send a playdate request
 *  AC7  Slot owner sees incoming pending request, can accept it
 *  AC8  Both parties see updated request status (accepted) after responding
 *
 * Seed families (password: "password123"):
 *   anderson@dummy.test — requester in cross-family flows
 *   brooks@dummy.test   — slot owner in accept/decline flows
 *   chen@dummy.test     — slot owner in decline-flow test
 *   davis@dummy.test    — isolated family with no requests (empty-state test)
 *
 * No availability slots or playdate requests are pre-seeded; tests that need
 * them create them via the backend API (port 4100 in e2e mode) using the
 * `request` Playwright fixture before interacting through the UI.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

const BACKEND = 'http://localhost:4100/api';

/** Obtain a JWT for a seeded dummy family via POST /api/auth/login. */
async function getToken(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post(`${BACKEND}/auth/login`, {
    data: { email, password: SEED_PASSWORD },
  });
  const body = await res.json() as { token?: string };
  if (!body.token) throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
  return body.token;
}

/**
 * Create a free availability slot for the authenticated family.
 * Returns the created slot's id.
 */
async function createSlot(
  request: APIRequestContext,
  token: string,
  slot: { date: string; startTime: string; endTime: string; note?: string },
): Promise<string> {
  const res = await request.post(`${BACKEND}/playdates/availability`, {
    headers: { authorization: `Bearer ${token}` },
    data: { ...slot, status: 'free' },
  });
  const body = await res.json() as { id?: string };
  if (!body.id) throw new Error(`createSlot failed: ${JSON.stringify(body)}`);
  return body.id;
}

/**
 * Navigate to another family's profile via the community search, so we don't
 * depend on the feed having a post from that family to click.
 */
async function goToFamilyProfile(page: Parameters<typeof loginAs>[0], familyDisplayName: string) {
  await page.goto('/search');
  await page.getByLabel('Search').fill(familyDisplayName.split(' ')[0] ?? familyDisplayName);
  await page.getByRole('button', { name: 'Search' }).click();
  const result = page.getByRole('link').filter({ hasText: familyDisplayName });
  await expect(result).toBeVisible();
  await result.click();
}

/** Returns today's ISO date string (YYYY-MM-DD) in the local timezone. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── AC1: /playdates page accessible after login ────────────────────────────

test.describe('AC1 — /playdates page loads with calendar and requests sidebar', () => {
  test('shows heading, week calendar controls, and requests sidebar after login', async ({ page }) => {
    await loginAs(page, 'anderson@dummy.test');
    await page.goto('/playdates');

    await expect(page.getByRole('heading', { name: 'Playdates', level: 1 })).toBeVisible();

    // Calendar view toggle buttons
    await expect(page.getByRole('button', { name: 'week', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'month', exact: true })).toBeVisible();

    // Navigation controls
    await expect(page.getByRole('button', { name: '← Prev' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next →' })).toBeVisible();

    // Requests sidebar heading
    await expect(page.getByRole('heading', { name: 'Playdate Requests' })).toBeVisible();
  });

  test('redirects to /login when navigating to /playdates unauthenticated', async ({ page }) => {
    await page.goto('/playdates');
    await expect(page).toHaveURL(/\/login/);
  });
});

// ── AC2: Add an availability slot ─────────────────────────────────────────

test.describe('AC2 — add an availability slot', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'anderson@dummy.test');
    await page.goto('/playdates');
  });

  test('opens the Add Availability Slot dialog from the + Add Slot button', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add Slot' }).click();

    const dialog = page.getByRole('dialog', { name: 'Add Availability Slot' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Add Slot' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('saves a free slot and renders it in the week calendar', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add Slot' }).click();

    const dialog = page.getByRole('dialog', { name: 'Add Availability Slot' });

    // Set date to today so the slot appears in the current week view
    await dialog.getByLabel('Date').fill(today());

    // TimePicker: "Start time" hour=10, minute=00, AM → 10:00
    await dialog.getByLabel('Start time hour').selectOption('10');
    await dialog.getByLabel('Start time minute').selectOption('00');

    // TimePicker: "End time" hour=11, minute=00, AM → 11:00
    await dialog.getByLabel('End time hour').selectOption('11');
    await dialog.getByLabel('End time minute').selectOption('00');

    // Select Free status (default, but be explicit)
    await dialog.getByText('Free').click();

    const note = `E2E add-slot ${Date.now()}`;
    await dialog.getByLabel('Note').fill(note);

    await dialog.getByRole('button', { name: 'Add Slot' }).click();

    // Dialog closes on success
    await expect(dialog).not.toBeVisible();

    // Slot appears in the calendar — aria-label includes the note
    await expect(
      page.locator(`button[aria-label*="${note}"]`),
    ).toBeVisible();
  });

  test('shows an inline error when end time is not after start time', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add Slot' }).click();

    const dialog = page.getByRole('dialog', { name: 'Add Availability Slot' });
    await dialog.getByLabel('Date').fill(today());

    // Set start = 11:00 AM, end = 10:00 AM (end before start)
    await dialog.getByLabel('Start time hour').selectOption('11');
    await dialog.getByLabel('Start time minute').selectOption('00');
    await dialog.getByLabel('End time hour').selectOption('10');
    await dialog.getByLabel('End time minute').selectOption('00');

    await dialog.getByRole('button', { name: 'Add Slot' }).click();

    // Inline error via role=alert inside SlotForm
    await expect(page.getByRole('alert')).toContainText('End time must be after start time');

    // Dialog stays open
    await expect(dialog).toBeVisible();
  });
});

// ── AC3: Edit an existing slot ─────────────────────────────────────────────

test.describe('AC3 — edit an existing slot', () => {
  test('can edit a slot note and see the updated text in the calendar', async ({
    page,
    request,
  }) => {
    // Seed a slot via the API so this test is fully self-contained
    const token = await getToken(request, 'anderson@dummy.test');
    const originalNote = `E2E edit-original ${Date.now()}`;
    await createSlot(request, token, {
      date: today(),
      startTime: '13:00',
      endTime: '14:00',
      note: originalNote,
    });

    await loginAs(page, 'anderson@dummy.test');
    await page.goto('/playdates');

    // Click the slot in the calendar (aria-label: "1pm–2pm: <note>")
    await page.locator(`button[aria-label*="${originalNote}"]`).click();

    const dialog = page.getByRole('dialog', { name: 'Edit Slot' });
    await expect(dialog).toBeVisible();

    // Overwrite the note field
    const updatedNote = `${originalNote} UPDATED`;
    await dialog.getByLabel('Note').fill(updatedNote);
    await dialog.getByRole('button', { name: 'Save' }).click();

    // Dialog closes on success
    await expect(dialog).not.toBeVisible();

    // Updated note appears in the calendar
    await expect(
      page.locator(`button[aria-label*="${updatedNote}"]`),
    ).toBeVisible();
  });
});

// ── AC4: Delete a slot ────────────────────────────────────────────────────

test.describe('AC4 — delete a slot', () => {
  test('can delete a slot via the Edit dialog Delete button', async ({ page, request }) => {
    const token = await getToken(request, 'anderson@dummy.test');
    const note = `E2E delete-slot ${Date.now()}`;
    await createSlot(request, token, {
      date: today(),
      startTime: '15:00',
      endTime: '16:00',
      note,
    });

    await loginAs(page, 'anderson@dummy.test');
    await page.goto('/playdates');

    // Click the slot to open Edit dialog
    await page.locator(`button[aria-label*="${note}"]`).click();

    const dialog = page.getByRole('dialog', { name: 'Edit Slot' });
    await expect(dialog).toBeVisible();

    // Delete button is only shown in edit mode (not add mode)
    await expect(dialog.getByRole('button', { name: 'Delete' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();

    // Dialog closes after deletion
    await expect(dialog).not.toBeVisible();

    // Slot is no longer present in the calendar
    await expect(
      page.locator(`button[aria-label*="${note}"]`),
    ).toHaveCount(0);
  });
});

// ── AC5: /family/:id shows another family's free slots read-only ───────────

test.describe('AC5 — another family\'s free slots on their profile page', () => {
  test('shows the FamilyAvailability section with read-only free slots', async ({
    page,
    request,
  }) => {
    // Seed a free slot for Brooks so the calendar has something to render
    const brooksToken = await getToken(request, 'brooks@dummy.test');
    await createSlot(request, brooksToken, {
      date: today(),
      startTime: '09:00',
      endTime: '10:00',
    });

    await loginAs(page, 'anderson@dummy.test');
    await goToFamilyProfile(page, 'The Brooks Family');

    // FamilyAvailability section heading rendered for !isOwner
    await expect(
      page.getByRole('heading', { name: /Brooks.*availability/i }),
    ).toBeVisible();

    // No "+ Add Slot" button on another family's profile — read-only
    await expect(page.getByRole('button', { name: '+ Add Slot' })).toHaveCount(0);

    // Seeded free slot is clickable (aria-label contains "9am")
    await expect(
      page.locator('button[aria-label*="9am"]'),
    ).toBeVisible();
  });

  test('does not show FamilyAvailability section on the viewer\'s own profile', async ({ page }) => {
    await loginAs(page, 'anderson@dummy.test');
    await page.goto('/family/me');

    // FamilyAvailability is only rendered when !data.isOwner
    await expect(
      page.getByRole('heading', { name: /availability/i }),
    ).toHaveCount(0);
  });
});

// ── AC6: Send a playdate request from a free slot ──────────────────────────

test.describe('AC6 — send a playdate request from another family\'s free slot', () => {
  test('opens Request a Playdate modal and submits a request', async ({ page, request }) => {
    // Seed a free slot for Brooks
    const brooksToken = await getToken(request, 'brooks@dummy.test');
    await createSlot(request, brooksToken, {
      date: today(),
      startTime: '10:00',
      endTime: '11:00',
    });

    await loginAs(page, 'anderson@dummy.test');
    await goToFamilyProfile(page, 'The Brooks Family');

    // Click the free slot to open the modal
    const slotBtn = page.locator('button[aria-label*="10am"]').first();
    await expect(slotBtn).toBeVisible();
    await slotBtn.click();

    const modal = page.getByRole('dialog', { name: 'Request a Playdate' });
    await expect(modal).toBeVisible();

    // SlotSummaryBlock shows the family name
    await expect(modal.getByText(/Brooks.*free slot/i)).toBeVisible();

    const message = `E2E playdate message ${Date.now()}`;
    await modal.getByLabel('Message').fill(message);
    await modal.getByRole('button', { name: 'Send Request' }).click();

    // Success state: "Request sent!" confirmation inside the modal
    await expect(modal.getByText('Request sent!')).toBeVisible();

    // Dismiss
    await modal.getByRole('button', { name: 'Done' }).click();
    await expect(modal).not.toBeVisible();
  });
});

// ── AC7 + AC8: Owner sees pending request, can accept; status updates ──────

test.describe('AC7 + AC8 — requests sidebar: pending requests, accept, status visible to both', () => {
  test('owner sees pending incoming request grouped under "Needs your response"', async ({
    page,
    request,
  }) => {
    // Seed a free slot for Brooks
    const brooksToken = await getToken(request, 'brooks@dummy.test');
    const slotId = await createSlot(request, brooksToken, {
      date: today(),
      startTime: '11:00',
      endTime: '12:00',
    });

    // Anderson sends a request to that slot
    const andersonToken = await getToken(request, 'anderson@dummy.test');
    await request.post(`${BACKEND}/playdates/requests`, {
      headers: { authorization: `Bearer ${andersonToken}` },
      data: { slotId, message: 'E2E accept-flow setup' },
    });

    // Brooks views their /playdates page
    await loginAs(page, 'brooks@dummy.test');
    await page.goto('/playdates');

    await expect(page.getByRole('heading', { name: /Playdate Requests/i })).toBeVisible();
    await expect(page.getByText('Needs your response', { exact: false })).toBeVisible();

    // RequestCard containing the requester family name
    const requestCard = page
      .locator('div[class*="rounded"][class*="border"]')
      .filter({ hasText: /Anderson/i })
      .first();
    await expect(requestCard).toBeVisible();
    await expect(requestCard.getByText('pending')).toBeVisible();

    // Accept/Decline buttons visible for owner with pending request
    await expect(requestCard.getByRole('button', { name: 'Accept' })).toBeVisible();
    await expect(requestCard.getByRole('button', { name: 'Decline' })).toBeVisible();
  });

  test('owner can accept a pending request and status updates to accepted (AC8)', async ({
    page,
    request,
  }) => {
    const brooksToken = await getToken(request, 'brooks@dummy.test');
    const slotId = await createSlot(request, brooksToken, {
      date: today(),
      startTime: '11:00',
      endTime: '12:00',
    });

    const andersonToken = await getToken(request, 'anderson@dummy.test');
    await request.post(`${BACKEND}/playdates/requests`, {
      headers: { authorization: `Bearer ${andersonToken}` },
      data: { slotId, message: 'E2E accept-action' },
    });

    await loginAs(page, 'brooks@dummy.test');
    await page.goto('/playdates');

    const requestCard = page
      .locator('div[class*="rounded"][class*="border"]')
      .filter({ hasText: /Anderson/i })
      .first();
    await expect(requestCard).toBeVisible();

    await requestCard.getByRole('button', { name: 'Accept' }).click();

    // Status badge updates to "accepted"
    await expect(requestCard.getByText('accepted')).toBeVisible();

    // Accept/Decline buttons are removed for resolved requests
    await expect(requestCard.getByRole('button', { name: 'Accept' })).toHaveCount(0);
    await expect(requestCard.getByRole('button', { name: 'Decline' })).toHaveCount(0);
  });

  test('owner can decline a pending request and status updates to declined', async ({
    page,
    request,
  }) => {
    const chenToken = await getToken(request, 'chen@dummy.test');
    const slotId = await createSlot(request, chenToken, {
      date: today(),
      startTime: '16:00',
      endTime: '17:00',
    });

    const andersonToken = await getToken(request, 'anderson@dummy.test');
    await request.post(`${BACKEND}/playdates/requests`, {
      headers: { authorization: `Bearer ${andersonToken}` },
      data: { slotId, message: 'E2E decline-action' },
    });

    await loginAs(page, 'chen@dummy.test');
    await page.goto('/playdates');

    const requestCard = page
      .locator('div[class*="rounded"][class*="border"]')
      .filter({ hasText: /Anderson/i })
      .first();
    await expect(requestCard).toBeVisible();

    await requestCard.getByRole('button', { name: 'Decline' }).click();

    // Status badge updates to "declined"
    await expect(requestCard.getByText('declined')).toBeVisible();

    await expect(requestCard.getByRole('button', { name: 'Accept' })).toHaveCount(0);
    await expect(requestCard.getByRole('button', { name: 'Decline' })).toHaveCount(0);
  });

  test('requester sees accepted status on their /playdates page after owner responds (AC8)', async ({
    page,
    request,
  }) => {
    const brooksToken = await getToken(request, 'brooks@dummy.test');
    const slotId = await createSlot(request, brooksToken, {
      date: today(),
      startTime: '08:00',
      endTime: '09:00',
    });

    const andersonToken = await getToken(request, 'anderson@dummy.test');
    const reqRes = await request.post(`${BACKEND}/playdates/requests`, {
      headers: { authorization: `Bearer ${andersonToken}` },
      data: { slotId, message: 'E2E AC8 requester-view' },
    });
    const reqBody = await reqRes.json() as { id?: string };
    const requestId = reqBody.id;

    // Brooks accepts via the API (owner responding out-of-band)
    await request.put(`${BACKEND}/playdates/requests/${requestId}/respond`, {
      headers: { authorization: `Bearer ${brooksToken}` },
      data: { status: 'accepted' },
    });

    // Anderson (requester) checks their own /playdates page
    await loginAs(page, 'anderson@dummy.test');
    await page.goto('/playdates');

    await expect(page.getByRole('heading', { name: /Playdate Requests/i })).toBeVisible();

    // Request card showing Brooks as the other party
    const requestCard = page
      .locator('div[class*="rounded"][class*="border"]')
      .filter({ hasText: /Brooks/i })
      .first();
    await expect(requestCard).toBeVisible();

    // AC8: requester sees "accepted" status
    await expect(requestCard.getByText('accepted')).toBeVisible();

    // Requester never sees Accept/Decline — those are owner-only
    await expect(requestCard.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  });
});

// ── Requests sidebar — empty state ─────────────────────────────────────────

test.describe('requests sidebar — empty state', () => {
  test('shows empty state text when there are no requests', async ({ page }) => {
    // davis@dummy.test: no slots or requests seeded for this family
    await loginAs(page, 'davis@dummy.test');
    await page.goto('/playdates');

    await expect(page.getByRole('heading', { name: /Playdate Requests/i })).toBeVisible();
    await expect(page.getByText(/No playdate requests yet/i)).toBeVisible();
  });
});

// ── Calendar view toggle ───────────────────────────────────────────────────

test.describe('calendar view toggle', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'anderson@dummy.test');
    await page.goto('/playdates');
  });

  test('switches to month view when Month button is clicked', async ({ page }) => {
    await page.getByRole('button', { name: 'month', exact: true }).click();
    // In month view the week toggle is still present (switching back)
    await expect(page.getByRole('button', { name: 'week', exact: true })).toBeVisible();
  });

  test('switches back to week view when Week button is clicked', async ({ page }) => {
    await page.getByRole('button', { name: 'month', exact: true }).click();
    await page.getByRole('button', { name: 'week', exact: true }).click();
    // In week view the day-column header "Mon" is visible
    await expect(page.getByText('Mon')).toBeVisible();
  });
});
