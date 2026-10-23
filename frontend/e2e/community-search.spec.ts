import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAs } from './utils/login';

/**
 * `/search`, the browsable family directory
 * (fofafu_vault/features/search-browse-directory.md).
 *
 * Needs no backend. Sign-in is whatever `loginAs` does in this environment
 * (see e2e/README.md), and every Edge Function and PostgREST response is
 * stubbed with `page.route`, so the families on screen are the ones below in
 * either sign-in mode.
 *
 * Time is pinned. The browser's clock and time zone are fixed, and every slot
 * below is computed from that one moment, so the suite reads the same on any
 * date and on any machine.
 */

// Monday 5 October 2026, 09:00 on the browser's wall clock, in the floating
// local format slot times use. Pacific time is deliberate: local time and UTC
// differ there, so a `now` built from UTC instead of the local clock would
// show up as 16:00.
const TIME_ZONE = 'America/Los_Angeles';
const NOW_LOCAL = '2026-10-05T09:00:00';
const NOW = new Date(`${NOW_LOCAL}-07:00`);

interface Offset {
  days?: number;
  hours?: number;
  minutes?: number;
}

/** The wall-clock time that far from the pinned clock, in the same floating local format. */
function fromNow({ days = 0, hours = 0, minutes = 0 }: Offset): string {
  const elapsedMinutes = (days * 24 + hours) * 60 + minutes;
  return new Date(Date.parse(`${NOW_LOCAL}Z`) + elapsedMinutes * 60_000).toISOString().slice(0, 19);
}

// `loginAs` gives this family Portland, OR as its city and state.
const VIEWER_EMAIL = 'anderson@dummy.test';
const VIEWER_PLACE = 'Portland, OR';

interface FamilyRow {
  id: string;
  ownerId: string;
  name: string;
  bio: string;
  kidCount: number | null;
  avatarUrl: string | null;
  isOwner: boolean;
  updatedAt: string;
  city: string;
  state: string;
  nextFreeSlotId: string | null;
  nextFreeSlotStart: string | null;
}

/** One row of `community/recent` or `search/families`; `slotStart` is a floating local time. */
function family(name: string, city: string, state: string, slotStart: string | null = null): FamilyRow {
  const key = name.toLowerCase();
  return {
    id: `family-${key}`,
    ownerId: `owner-${key}`,
    name,
    bio: `Notes from the ${name} household.`,
    kidCount: null,
    avatarUrl: null,
    isOwner: false,
    updatedAt: fromNow({ days: -4 }),
    city,
    state,
    nextFreeSlotId: slotStart ? `slot-${key}` : null,
    nextFreeSlotStart: slotStart,
  };
}

// Every slot is placed relative to the pinned clock. The day and time labels
// the tests expect ("Wed, Oct 7 · 3:30pm") are what that clock makes of them.
const CHEN_SLOT_START = fromNow({ days: 2, hours: 6, minutes: 30 }); // Wednesday 15:30
const CHEN_SLOT_END = fromNow({ days: 2, hours: 7, minutes: 30 });

const CHEN = family('Chen', 'Portland', 'OR', CHEN_SLOT_START);
const DAVIS = family('Davis', 'Portland', 'OR'); // no free slot
const BROOKS = family('Brooks', 'Austin', 'TX', fromNow({ days: 5, hours: 1 })); // Saturday 10:00
const OKAFOR = family('Okafor', 'Portland', 'OR', fromNow({ days: 7, minutes: 30 })); // 30 minutes past the 7-day window
const RIVERA = family('Rivera', 'Seattle', 'WA', fromNow({ minutes: -30 })); // started 30 minutes ago
const NGUYEN = family('Nguyen', 'Seattle', 'WA', fromNow({ days: 6, hours: 5 })); // Sunday 14:00

/** In the order the endpoint returns them: newest first. */
const DIRECTORY = [CHEN, DAVIS, BROOKS, OKAFOR, RIVERA, NGUYEN];

/** The slot behind Chen's `nextFreeSlotId`, as the family page's availability endpoint returns it. */
const CHEN_SLOT = {
  id: CHEN.nextFreeSlotId,
  familyId: CHEN.id,
  date: CHEN_SLOT_START.slice(0, 10),
  startTime: CHEN_SLOT_START.slice(11, 16),
  endTime: CHEN_SLOT_END.slice(11, 16),
  status: 'free',
  note: null,
  createdAt: fromNow({ days: -4 }),
  updatedAt: fromNow({ days: -4 }),
};

const edge = (path: string) => (url: URL) => url.pathname === `/functions/v1/${path}`;
const anyDataRequest = (url: URL) => /^\/(functions|rest)\/v1\//.test(url.pathname);

/** What `search/families` matches a query against. */
function searchable(row: FamilyRow): string {
  return [row.name, row.bio, row.city, row.state].join(' ').toLowerCase();
}

/**
 * The browse and search endpoints answer from DIRECTORY. Anything else the
 * app asks Supabase for (unread count, own family, feed) gets a 404, which
 * every caller already treats as "nothing to show", so no request leaves the
 * machine. Later routes win, so a test can replace either endpoint.
 */
async function stubBackend(page: Page): Promise<void> {
  await page.route(anyDataRequest, (route) =>
    route.fulfill({ status: 404, json: { error: 'Not stubbed in community-search.spec.ts' } }),
  );
  await page.route(edge('community/recent'), (route) => route.fulfill({ json: DIRECTORY }));
  await page.route(edge('search/families'), (route) => {
    const q = (new URL(route.request().url()).searchParams.get('q') ?? '').toLowerCase();
    return route.fulfill({ json: DIRECTORY.filter((row) => searchable(row).includes(q)) });
  });
}

const filterCard = (page: Page) => page.getByRole('complementary', { name: 'Filters' });
const families = (page: Page) => page.getByRole('region', { name: 'Families' });
const rail = (page: Page) => page.getByRole('complementary', { name: 'Open for playdates this week' });
const familyLinks = (page: Page) => families(page).getByRole('listitem').getByRole('link');
const countLine = (page: Page) => page.getByRole('status');
const nearMe = (page: Page) => page.getByRole('checkbox', { name: 'Near me' });
const openForPlaydates = (page: Page) => page.getByRole('checkbox', { name: 'Open for playdates' });
const clearFilters = (page: Page) => page.getByRole('button', { name: 'Clear filters' });

/** The visible "Playdate" badge on a card; its hidden label reads "Open playdate slot". */
const BADGE = /Playdate$/;

const cardNames = (...rows: FamilyRow[]) => rows.map((row) => `The ${row.name} family`);

async function submitQuery(page: Page, text: string): Promise<void> {
  await page.getByLabel('Search').fill(text);
  await page.getByRole('button', { name: 'Search' }).click();
}

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error(`Nothing on screen to measure for ${locator}`);
  return bounds;
}

/** Presses Tab until `target` has focus, so a test does not depend on how many stops the navbar has. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let presses = 0; presses < 20; presses += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Tab never reached ${target}`);
}

test.use({ timezoneId: TIME_ZONE });

test.describe('community search', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await stubBackend(page);
    await loginAs(page, VIEWER_EMAIL);
  });

  test('lists families on arrival, before any query', async ({ page }) => {
    await page.goto('/search');

    await expect(familyLinks(page)).toHaveText(cardNames(...DIRECTORY));
    await expect(families(page).getByText('6 families · newest first')).toBeVisible();
  });

  test('is reached from the View all link on Home', async ({ page }) => {
    await page.getByRole('link', { name: 'View all →' }).click();

    await expect(page).toHaveURL('/search');
    await expect(familyLinks(page)).toHaveText(cardNames(...DIRECTORY));
  });

  test('shows where each family is, and a playdate badge only for a free slot still to come', async ({ page }) => {
    await page.goto('/search');

    const badged = families(page).getByRole('listitem').filter({ has: page.getByText(BADGE) });
    await expect(badged.getByRole('link')).toHaveText(cardNames(CHEN, BROOKS, OKAFOR, NGUYEN));
    await expect(familyLinks(page).first()).toHaveAccessibleDescription('Portland, OR Open playdate slot');
    await expect(families(page).getByRole('listitem').first()).toContainText(CHEN.bio);
  });

  test('lays out filters, families and open playdates as three columns', async ({ page }) => {
    await page.goto('/search');
    await expect(familyLinks(page)).toHaveText(cardNames(...DIRECTORY));

    const main = await box(page.getByRole('main'));
    const left = await box(filterCard(page));
    const centre = await box(families(page));
    const right = await box(rail(page));

    expect(main.width).toBe(1100);
    expect([left.width, right.width]).toEqual([240, 240]);
    expect(left.x + left.width).toBeLessThan(centre.x);
    expect(centre.x + centre.width).toBeLessThan(right.x);
    expect([centre.y, right.y]).toEqual([left.y, left.y]);
  });

  test("asks for the directory at the browser's local time", async ({ page }) => {
    const browse = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return edge('community/recent')(url) && url.searchParams.get('limit') === '50';
    });

    await page.goto('/search');

    expect(new URL((await browse).url()).searchParams.get('now')).toBe(NOW_LOCAL);
  });

  test('rejects queries under 2 characters', async ({ page }) => {
    await page.goto('/search');

    await submitQuery(page, 'a');

    await expect(page.getByText('At least 2 characters.')).toBeVisible();
    await expect(page).toHaveURL('/search');
    await expect(familyLinks(page)).toHaveText(cardNames(...DIRECTORY));
  });

  test('a query narrows the list, and clearing it returns to browsing', async ({ page }) => {
    await page.goto('/search');

    await submitQuery(page, 'seattle');

    await expect(countLine(page)).toHaveText('2 matching families, for “seattle”');
    await expect(familyLinks(page)).toHaveText(cardNames(RIVERA, NGUYEN));
    await expect(familyLinks(page).last()).toHaveAccessibleDescription('Seattle, WA Open playdate slot');

    await submitQuery(page, '');

    await expect(countLine(page)).toHaveText('6 families');
    await expect(familyLinks(page)).toHaveText(cardNames(...DIRECTORY));
    await expect(page).toHaveURL('/search');
  });

  test('finds a family by name and links to their profile', async ({ page }) => {
    await page.route(edge(`family/${CHEN.id}`), (route) => route.fulfill({ json: CHEN }));
    await page.goto('/search');

    await submitQuery(page, 'chen');
    await expect(countLine(page)).toHaveText('1 matching family, for “chen”');
    await page.getByRole('link', { name: 'The Chen family' }).click();

    await expect(page).toHaveURL(`/family/${CHEN.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'The Chen family' })).toBeVisible();
  });

  test("Near me narrows the list to the viewer's city and state", async ({ page }) => {
    await page.goto('/search');
    await expect(nearMe(page)).toHaveAccessibleDescription(VIEWER_PLACE);

    await nearMe(page).check();

    await expect(countLine(page)).toHaveText(`3 families in ${VIEWER_PLACE}`);
    await expect(familyLinks(page)).toHaveText(cardNames(CHEN, DAVIS, OKAFOR));
  });

  test('Open for playdates narrows the list to families with a free slot still to come', async ({ page }) => {
    await page.goto('/search');

    await openForPlaydates(page).check();

    await expect(countLine(page)).toHaveText('4 families open for playdates');
    await expect(familyLinks(page)).toHaveText(cardNames(CHEN, BROOKS, OKAFOR, NGUYEN));
  });

  test('both filters combine, and Clear filters resets them', async ({ page }) => {
    await page.goto('/search');

    await nearMe(page).check();
    await openForPlaydates(page).check();

    await expect(countLine(page)).toHaveText(`2 families open for playdates in ${VIEWER_PLACE}`);
    await expect(familyLinks(page)).toHaveText(cardNames(CHEN, OKAFOR));

    await clearFilters(page).click();

    await expect(countLine(page)).toHaveText('6 families');
    await expect(nearMe(page)).not.toBeChecked();
    await expect(openForPlaydates(page)).not.toBeChecked();
    await expect(page).toHaveURL('/search');
  });

  test('keeps the query and both filters in the URL, and a reload restores the same view', async ({ page }) => {
    const filteredUrl = '/search?q=portland&near=1&open=1';
    const filteredCount = `2 matching families open for playdates in ${VIEWER_PLACE}, for “portland”`;
    await page.goto('/search');

    await submitQuery(page, 'portland');
    await expect(countLine(page)).toHaveText('3 matching families, for “portland”');
    await nearMe(page).check();
    await openForPlaydates(page).check();

    await expect(page).toHaveURL(filteredUrl);
    await expect(countLine(page)).toHaveText(filteredCount);

    await page.reload();

    await expect(page).toHaveURL(filteredUrl);
    await expect(page.getByLabel('Search')).toHaveValue('portland');
    await expect(nearMe(page)).toBeChecked();
    await expect(openForPlaydates(page)).toBeChecked();
    await expect(countLine(page)).toHaveText(filteredCount);
    await expect(familyLinks(page)).toHaveText(cardNames(CHEN, OKAFOR));
  });

  test('the rail lists only slots that start in the next 7 days, soonest first', async ({ page }) => {
    await page.goto('/search');

    await expect(rail(page).getByRole('listitem')).toHaveText([
      /Chen.*Wed, Oct 7 · 3:30pm/,
      /Brooks.*Sat, Oct 10 · 10am/,
      /Nguyen.*Sun, Oct 11 · 2pm/,
    ]);
  });

  test('a Request link opens the request flow for that slot', async ({ page }) => {
    // The family page drops `requestSlot` from the URL once it has opened the
    // dialog, so its slots are held back until the URL has been checked.
    let releaseSlots = (): void => {};
    const slotsReleased = new Promise<void>((resolve) => {
      releaseSlots = resolve;
    });
    await page.route(edge(`family/${CHEN.id}`), (route) => route.fulfill({ json: CHEN }));
    await page.route(edge(`playdates/availability/${CHEN.id}`), async (route) => {
      await slotsReleased;
      await route.fulfill({ json: [CHEN_SLOT] });
    });
    await page.goto('/search');

    await rail(page)
      .getByRole('link', { name: 'Request a playdate with Chen on Wednesday, October 7 at 3:30pm' })
      .click();

    await expect(page).toHaveURL(`/family/${CHEN.id}?requestSlot=${CHEN_SLOT.id}`);
    releaseSlots();
    await expect(page.getByRole('dialog', { name: 'Request a Playdate' })).toContainText("Chen's free slot");
  });

  test('works from the keyboard alone: Tab to a filter, Space to toggle it, Tab on to a result', async ({ page }) => {
    await page.route(edge(`family/${CHEN.id}`), (route) => route.fulfill({ json: CHEN }));
    await page.goto('/search');
    await expect(familyLinks(page)).toHaveText(cardNames(...DIRECTORY));

    await tabTo(page, nearMe(page));
    await page.keyboard.press('Space');

    await expect(nearMe(page)).toBeChecked();
    await expect(nearMe(page)).toBeFocused();
    await expect(countLine(page)).toHaveText(`3 families in ${VIEWER_PLACE}`);

    const stops = [
      openForPlaydates(page),
      clearFilters(page),
      page.getByLabel('Search'),
      page.getByRole('button', { name: 'Search' }),
      familyLinks(page).first(),
    ];
    for (const stop of stops) {
      await page.keyboard.press('Tab');
      await expect(stop).toBeFocused();
    }

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/family/${CHEN.id}`);
  });

  test('says so when the directory cannot load, and Try again recovers', async ({ page }) => {
    let backendUp = false;
    await page.route(edge('community/recent'), (route) =>
      backendUp ? route.fallback() : route.fulfill({ status: 500, json: { error: 'upstream exploded' } }),
    );
    await page.goto('/search');

    await expect(page.getByRole('alert')).toHaveText("We couldn't load families. Try again in a moment.");
    await expect(rail(page).getByText("We couldn't load open playdates.")).toBeVisible();

    backendUp = true;
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(familyLinks(page)).toHaveText(cardNames(...DIRECTORY));
    await expect(rail(page).getByRole('listitem')).toHaveCount(3);
  });

  test('still lists families when the backend does not send slot start times yet', async ({ page }) => {
    // `undefined` is dropped from the JSON, so the key is missing, as it is
    // from the `community` function that is deployed today.
    const deployedToday = DIRECTORY.map((row) => ({ ...row, nextFreeSlotStart: undefined }));
    await page.route(edge('community/recent'), (route) => route.fulfill({ json: deployedToday }));
    await page.goto('/search');

    await expect(familyLinks(page)).toHaveText(cardNames(...DIRECTORY));
    await expect(families(page).getByText(BADGE)).toHaveCount(0);
    await expect(rail(page).getByText('No free slots in the next 7 days.')).toBeVisible();
  });

  test.describe('below md', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('is one column: the filters stay reachable above the list and the rail is hidden', async ({ page }) => {
      await page.goto('/search');
      await expect(familyLinks(page)).toHaveText(cardNames(...DIRECTORY));

      await expect(filterCard(page)).toBeHidden();
      await expect(rail(page)).toBeHidden();

      const bar = page.getByRole('group', { name: 'Filters' });
      const search = await box(page.getByLabel('Search'));
      const filters = await box(bar);
      const firstCard = await box(families(page).getByRole('listitem').first());
      expect(search.y).toBeLessThan(filters.y);
      expect(filters.y + filters.height).toBeLessThanOrEqual(firstCard.y);
      expect(firstCard.width).toBe(343);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);

      await nearMe(page).check();
      await openForPlaydates(page).check();
      await expect(countLine(page)).toHaveText(`2 families open for playdates in ${VIEWER_PLACE}`);
      await expect(familyLinks(page)).toHaveText(cardNames(CHEN, OKAFOR));

      await clearFilters(page).click();
      await expect(countLine(page)).toHaveText('6 families');
    });
  });
});
