import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { useLocation, useNavigate } from 'react-router-dom';
import { renderWithProviders } from '@/tests/render';
import { server, handlers, FUNCTIONS_BASE, SUPABASE_URL } from '@/tests/msw-server';
import { expectNoA11yViolations } from '@/tests/a11y';
import { useAuthStore, type AuthUser } from '@/stores/auth';
import { useBlockFamilyMutation } from '@/features/moderation/hooks/useBlock';
import SearchPage from './Search';

// Monday 5 October 2026, 09:00 on the local wall clock.
const NOW = new Date(2026, 9, 5, 9, 0, 0);

const OAKLAND_USER: AuthUser = { id: 'u1', email: 'h@example.com', name: 'Hernandez', city: 'Oakland', state: 'CA' };

function family(overrides: Record<string, unknown>) {
  return {
    id: 'f0',
    ownerId: 'u0',
    name: 'Family',
    bio: '',
    kidCount: null,
    avatarUrl: null,
    isOwner: false,
    updatedAt: '2026-10-01T12:00:00+00:00',
    city: '',
    state: '',
    nextFreeSlotId: null,
    nextFreeSlotStart: null,
    ...overrides,
  };
}

const ANDERSON = family({
  id: 'f-anderson',
  name: 'Anderson',
  bio: 'Fostering since 2019.',
  city: 'Oakland',
  state: 'CA',
  nextFreeSlotId: 'slot-a',
  nextFreeSlotStart: '2026-10-07T15:30:00',
});
const RIVERA = family({ id: 'f-rivera', name: 'Rivera', bio: 'Bilingual home.', city: 'Berkeley', state: 'CA' });
const KURATA = family({
  id: 'f-kurata',
  name: 'Kurata',
  city: 'Oakland',
  state: 'CA',
  nextFreeSlotId: 'slot-k',
  nextFreeSlotStart: '2026-10-10T10:00:00',
});
const PATEL = family({ id: 'f-patel', name: 'Patel', city: 'Oakland', state: 'CA' });
const NGUYEN = family({
  id: 'f-nguyen',
  name: 'Nguyen',
  city: 'Alameda',
  state: 'CA',
  nextFreeSlotId: 'slot-n',
  nextFreeSlotStart: '2026-10-11T14:00:00',
});
const DIRECTORY = [ANDERSON, RIVERA, KURATA, PATEL, NGUYEN];

// The shape the not-yet-redeployed `search` function returns.
const sampleResult = [{
  id: 'f1',
  ownerId: 'u1',
  name: 'Garcia',
  bio: 'caring for three teens since 2022',
  kidCount: null,
  avatarUrl: null,
  isOwner: false,
  updatedAt: '2026-05-18',
}];

function browseReturns(rows: JsonBodyType) {
  server.use(http.get(`${FUNCTIONS_BASE}/community/recent`, () => HttpResponse.json(rows)));
}

function searchReturns(rows: JsonBodyType) {
  server.use(http.get(`${FUNCTIONS_BASE}/search/families`, () => HttpResponse.json(rows)));
}

function signIn(user: AuthUser = OAKLAND_USER) {
  useAuthStore.getState().setAuth({ token: 'jwt', user });
}

function LocationProbe() {
  const { search } = useLocation();
  return <span data-testid="location-search">{search}</span>;
}

function renderSearch(route = '/search') {
  return renderWithProviders(
    <>
      <SearchPage />
      <LocationProbe />
    </>,
    { route },
  );
}

const urlSearch = () => screen.getByTestId('location-search').textContent;
const filterCard = () => within(screen.getByRole('complementary', { name: 'Filters' }));
const filterBar = () => within(screen.getByRole('group', { name: 'Filters' }));
const centre = () => within(screen.getByRole('region', { name: 'Families' }));
const rail = () => within(screen.getByRole('complementary', { name: 'Open for playdates this week' }));
const cards = () => within(centre().getByRole('list')).getAllByRole('listitem');
const cardNames = () => cards().map((card) => within(card).getByRole('link').textContent);

async function listSettles() {
  await waitFor(() => expect(screen.getByRole('status')).not.toHaveTextContent(/Loading families…|Searching…/));
}

async function submitQuery(user: ReturnType<typeof userEvent.setup>, text: string) {
  const input = screen.getByLabelText('Search');
  await user.clear(input);
  if (text) await user.type(input, text);
  await user.click(screen.getByRole('button', { name: 'Search' }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  server.use(
    handlers.messagesUnreadCount(),
    handlers.familyMe({ ...family({ id: 'f-me', ownerId: 'u1', name: 'Hernandez' }), isOwner: true }),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, () => HttpResponse.json(false)),
    handlers.communityRecent([]),
  );
});

afterEach(() => {
  vi.useRealTimers();
  useAuthStore.getState().clear();
});

describe('SearchPage', () => {
  it('submits the query and renders result cards', async () => {
    let receivedQ: string | null = null;
    server.use(
      http.get(`${FUNCTIONS_BASE}/search/families`, ({ request }) => {
        const url = new URL(request.url);
        receivedQ = url.searchParams.get('q');
        return HttpResponse.json(sampleResult);
      }),
    );

    renderWithProviders(<SearchPage />, { route: '/search' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/search/i), 'garcia');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(await screen.findByText(/the garcia family/i)).toBeInTheDocument();
    expect(receivedQ).toBe('garcia');
  });

  it('rejects too-short queries client-side without firing the API', async () => {
    let fired = false;
    server.use(
      http.get(`${FUNCTIONS_BASE}/search/families`, () => {
        fired = true;
        return HttpResponse.json([]);
      }),
    );

    renderWithProviders(<SearchPage />, { route: '/search' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/search/i), 'a');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(await screen.findByText(/at least 2 characters/i)).toBeInTheDocument();
    expect(fired).toBe(false);
  });
});

describe('SearchPage browse list', () => {
  it('lists families in the order the API returns them before any query is submitted', async () => {
    browseReturns(DIRECTORY);

    renderSearch();

    expect(await centre().findByRole('link', { name: 'The Anderson family' })).toHaveAttribute('href', '/family/f-anderson');
    expect(cardNames()).toEqual([
      'The Anderson family',
      'The Rivera family',
      'The Kurata family',
      'The Patel family',
      'The Nguyen family',
    ]);
  });

  it('asks for 50 families and sends the local wall-clock time as now', async () => {
    let params = new URLSearchParams();
    server.use(
      http.get(`${FUNCTIONS_BASE}/community/recent`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json(DIRECTORY);
      }),
    );

    renderSearch();
    await listSettles();

    expect(params.get('limit')).toBe('50');
    expect(params.get('now')).toBe('2026-10-05T09:00:00');
  });

  it('shows the location, the bio and the playdate badge on a card', async () => {
    browseReturns([ANDERSON]);

    renderSearch();
    await listSettles();

    const [card] = cards();
    expect(card).toHaveTextContent('Oakland, CA');
    expect(card).toHaveTextContent('Fostering since 2019.');
    expect(within(card!).getByText('🗓 Playdate')).toBeInTheDocument();
    expect(within(card!).getByRole('link')).toHaveAccessibleDescription('Oakland, CA Open playdate slot');
  });

  it('shows no badge when the next free slot has already started', async () => {
    browseReturns([family({ id: 'f-past', name: 'Past', nextFreeSlotId: 'slot-p', nextFreeSlotStart: '2026-10-05T08:59:00' })]);

    renderSearch();
    await listSettles();

    expect(within(cards()[0]!).queryByText(/Playdate/)).not.toBeInTheDocument();
  });

  it('renders rows from a backend that does not send location or slot fields yet', async () => {
    browseReturns([
      ...sampleResult,
      { ...sampleResult[0], id: 'f2', name: 'Lee', city: 'Denver', state: 'CO', nextFreeSlotId: 'slot-l' },
    ]);

    renderSearch();
    await listSettles();

    expect(cardNames()).toEqual(['The Garcia family', 'The Lee family']);
    expect(cards()[1]).toHaveTextContent('Denver, CO');
    expect(centre().queryByText(/Playdate/)).not.toBeInTheDocument();
  });

  it('leaves the location line out when city and state are empty strings', async () => {
    browseReturns([family({ id: 'f-none', name: 'Nowhere', city: '', state: '' }), family({ id: 'f-half', name: 'Half', city: '', state: 'TX' })]);

    renderSearch();
    await listSettles();

    expect(within(cards()[0]!).getByRole('link')).toHaveAccessibleDescription('');
    expect(within(cards()[1]!).getByRole('link')).toHaveAccessibleDescription('TX');
  });

  it('uses the first letter after a leading article as the avatar initial', async () => {
    browseReturns([family({ id: 'f-the', name: 'The Brooks Family' })]);

    renderSearch();
    await listSettles();

    expect(within(cards()[0]!).getByText('B')).toBeInTheDocument();
  });

  it('no longer shows the pre-search hint or the Back home link', async () => {
    browseReturns(DIRECTORY);

    renderSearch();
    await listSettles();

    expect(screen.queryByText('Try a name, a city, or a few words from their bio.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back home' })).not.toBeInTheDocument();
  });
});

describe('SearchPage query', () => {
  it('sends the query with limit 50 and now, and puts it in the URL', async () => {
    let params = new URLSearchParams();
    server.use(
      http.get(`${FUNCTIONS_BASE}/search/families`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json([ANDERSON]);
      }),
    );
    renderSearch();
    const user = userEvent.setup();

    await submitQuery(user, ' anderson ');

    expect(await centre().findByRole('link', { name: 'The Anderson family' })).toBeInTheDocument();
    expect(Object.fromEntries(params)).toEqual({ q: 'anderson', limit: '50', now: '2026-10-05T09:00:00' });
    expect(urlSearch()).toBe('?q=anderson');
  });

  it('shows location and the playdate badge on query results', async () => {
    searchReturns([ANDERSON]);
    renderSearch();
    const user = userEvent.setup();

    await submitQuery(user, 'anderson');
    await centre().findByRole('link', { name: 'The Anderson family' });

    expect(cards()[0]).toHaveTextContent('Oakland, CA');
    expect(within(cards()[0]!).getByText('🗓 Playdate')).toBeInTheDocument();
  });

  it('runs the query found in the URL and fills the search box with it', async () => {
    searchReturns([ANDERSON]);

    renderSearch('/search?q=anderson');

    expect(await centre().findByRole('link', { name: 'The Anderson family' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search')).toHaveValue('anderson');
  });

  it('returns to the browse list when the query is cleared', async () => {
    browseReturns([RIVERA]);
    searchReturns([ANDERSON]);
    renderSearch('/search?q=anderson');
    const user = userEvent.setup();
    await centre().findByRole('link', { name: 'The Anderson family' });

    await submitQuery(user, '');

    expect(await centre().findByRole('link', { name: 'The Rivera family' })).toBeInTheDocument();
    expect(centre().queryByRole('link', { name: 'The Anderson family' })).not.toBeInTheDocument();
    expect(urlSearch()).toBe('');
  });

  it('ties the too-short error to the input and keeps focus there', async () => {
    renderSearch();
    const user = userEvent.setup();

    await submitQuery(user, 'a');

    const input = screen.getByLabelText('Search');
    expect(await screen.findByRole('alert')).toHaveTextContent('At least 2 characters.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('At least 2 characters.');
    expect(input).toHaveFocus();
  });
});

describe('SearchPage filters', () => {
  it('narrows the list to the user\'s city and state with Near me', async () => {
    signIn();
    browseReturns(DIRECTORY);
    renderSearch();
    const user = userEvent.setup();
    await listSettles();
    const nearMe = filterCard().getByRole('checkbox', { name: 'Near me' });

    await user.click(nearMe);

    expect(cardNames()).toEqual(['The Anderson family', 'The Kurata family', 'The Patel family']);
    expect(screen.getByRole('status')).toHaveTextContent(/^3 families in Oakland, CA$/);
    expect(urlSearch()).toBe('?near=1');
    expect(nearMe).toHaveFocus();
  });

  it('narrows the list to families with a future free slot with Open for playdates', async () => {
    signIn();
    browseReturns(DIRECTORY);
    renderSearch();
    const user = userEvent.setup();
    await listSettles();

    await user.click(filterCard().getByRole('checkbox', { name: 'Open for playdates' }));

    expect(cardNames()).toEqual(['The Anderson family', 'The Kurata family', 'The Nguyen family']);
    expect(screen.getByRole('status')).toHaveTextContent(/^3 families open for playdates$/);
    expect(urlSearch()).toBe('?open=1');
  });

  it('combines both filters', async () => {
    signIn();
    browseReturns(DIRECTORY);
    renderSearch();
    const user = userEvent.setup();
    await listSettles();

    await user.click(filterCard().getByRole('checkbox', { name: 'Near me' }));
    await user.click(filterCard().getByRole('checkbox', { name: 'Open for playdates' }));

    expect(cardNames()).toEqual(['The Anderson family', 'The Kurata family']);
    expect(screen.getByRole('status')).toHaveTextContent(/^2 families open for playdates in Oakland, CA$/);
    expect(urlSearch()).toBe('?near=1&open=1');
  });

  it('applies the filters to query results', async () => {
    signIn();
    searchReturns([ANDERSON, RIVERA, NGUYEN]);
    renderSearch('/search?q=an');
    const user = userEvent.setup();
    await centre().findByRole('link', { name: 'The Rivera family' });

    await user.click(filterCard().getByRole('checkbox', { name: 'Near me' }));

    expect(cardNames()).toEqual(['The Anderson family']);
    expect(screen.getByRole('status')).toHaveTextContent(/^1 matching family in Oakland, CA, for “an”$/);
    expect(urlSearch()).toBe('?q=an&near=1');
  });

  it('restores the filters from the URL', async () => {
    signIn();
    browseReturns(DIRECTORY);

    renderSearch('/search?near=1&open=1');
    await listSettles();

    expect(filterCard().getByRole('checkbox', { name: 'Near me' })).toBeChecked();
    expect(filterCard().getByRole('checkbox', { name: 'Open for playdates' })).toBeChecked();
    expect(cardNames()).toEqual(['The Anderson family', 'The Kurata family']);
  });

  it('resets both filters with Clear filters and leaves focus on the button', async () => {
    signIn();
    browseReturns(DIRECTORY);
    renderSearch('/search?near=1&open=1');
    const user = userEvent.setup();
    await listSettles();
    const clear = filterCard().getByRole('button', { name: 'Clear filters' });

    await user.click(clear);

    expect(cards()).toHaveLength(5);
    expect(filterCard().getByRole('checkbox', { name: 'Near me' })).not.toBeChecked();
    expect(filterCard().getByRole('checkbox', { name: 'Open for playdates' })).not.toBeChecked();
    expect(urlSearch()).toBe('');
    expect(clear).toHaveFocus();
  });

  it('marks Clear filters as unavailable, but still focusable, when no filter is on', async () => {
    signIn();
    browseReturns(DIRECTORY);
    renderSearch();
    const user = userEvent.setup();
    await listSettles();
    const clear = filterCard().getByRole('button', { name: 'Clear filters' });

    await user.click(clear);

    expect(clear).toHaveAttribute('aria-disabled', 'true');
    expect(clear).toBeEnabled();
    expect(clear).toHaveFocus();
    expect(cards()).toHaveLength(5);
  });

  it('describes Near me with the user\'s city and state', async () => {
    signIn();

    renderSearch();

    expect(filterCard().getByRole('checkbox', { name: 'Near me' })).toHaveAccessibleDescription('Oakland, CA');
    expect(filterCard().getByRole('checkbox', { name: 'Open for playdates' })).toHaveAccessibleDescription(
      'Has a free slot coming up',
    );
  });

  it('offers the same two filters in the bar that replaces the card on small screens', async () => {
    signIn();
    browseReturns(DIRECTORY);
    renderSearch();
    const user = userEvent.setup();
    await listSettles();

    await user.click(filterBar().getByRole('checkbox', { name: 'Open for playdates' }));

    expect(cards()).toHaveLength(3);
    expect(filterCard().getByRole('checkbox', { name: 'Open for playdates' })).toBeChecked();
    expect(filterBar().getByRole('button', { name: 'Clear filters' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps Near me off and says why when the user has no city or state on file', async () => {
    signIn({ ...OAKLAND_USER, city: '', state: 'CA' });
    browseReturns(DIRECTORY);
    renderSearch('/search?near=1');
    const user = userEvent.setup();
    await listSettles();
    const reason = "We don't have a city and state for your family.";

    for (const scope of [filterCard(), filterBar()]) {
      const nearMe = scope.getByRole('checkbox', { name: 'Near me' });
      await user.click(nearMe);
      expect(nearMe).toHaveAttribute('aria-disabled', 'true');
      expect(nearMe).not.toBeChecked();
      expect(nearMe).toHaveAccessibleDescription(reason);
      expect(scope.getByText(reason)).toBeInTheDocument();
    }
    expect(cards()).toHaveLength(5);
    expect(screen.getByRole('status')).toHaveTextContent(/^5 families$/);
  });

  it('honours near=1 from the URL once the signed-in user becomes known, and not before', async () => {
    browseReturns(DIRECTORY);
    renderSearch('/search?near=1');
    await listSettles();
    const nearMe = filterCard().getByRole('checkbox', { name: 'Near me' });
    expect(nearMe).not.toBeChecked();
    expect(cards()).toHaveLength(5);

    act(() => signIn());

    expect(nearMe).toBeChecked();
    expect(cardNames()).toEqual(['The Anderson family', 'The Kurata family', 'The Patel family']);
  });
});

describe('SearchPage count line and announcements', () => {
  it('has one status element from first render that goes from loading to the count', async () => {
    browseReturns(DIRECTORY);

    renderSearch();

    expect(screen.getByRole('status')).toHaveTextContent('Loading families…');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^5 families$/));
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('appends the sort order to the browse count line outside the status element', async () => {
    browseReturns(DIRECTORY);

    renderSearch();
    await listSettles();

    expect(screen.getByRole('status').parentElement).toHaveTextContent(/^5 families · newest first$/);
  });

  it('leaves the sort order off for a single family and in query mode', async () => {
    browseReturns([ANDERSON]);
    searchReturns([ANDERSON, RIVERA]);
    renderSearch();
    const user = userEvent.setup();
    await listSettles();
    const single = screen.getByRole('status').parentElement?.textContent;

    await submitQuery(user, 'an');
    await centre().findByRole('link', { name: 'The Rivera family' });

    expect(single).toBe('1 family');
    expect(screen.getByRole('status').parentElement).not.toHaveTextContent('newest first');
  });

  it('names the query in the status element through a visually hidden suffix', async () => {
    searchReturns([ANDERSON, RIVERA]);

    renderSearch('/search?q=an');
    await centre().findByRole('link', { name: 'The Rivera family' });

    expect(screen.getByRole('status')).toHaveTextContent(/^2 matching families, for “an”$/);
    expect(screen.getByText(', for “an”')).toHaveClass('sr-only');
  });

  it('announces nothing new while the user types without submitting', async () => {
    browseReturns(DIRECTORY);
    renderSearch();
    const user = userEvent.setup();
    await listSettles();

    await user.type(screen.getByLabelText('Search'), 'anders');

    expect(screen.getByRole('status')).toHaveTextContent(/^5 families$/);
    expect(cards()).toHaveLength(5);
  });

  it('announces Searching while a submitted query loads', async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(`${FUNCTIONS_BASE}/search/families`, async () => {
        await held;
        return HttpResponse.json([ANDERSON]);
      }),
    );
    renderSearch();
    const user = userEvent.setup();
    await listSettles();

    await submitQuery(user, 'anderson');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^Searching…$/));
    release?.();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^1 matching family, for “anderson”$/));
  });
});

describe('SearchPage empty and error states', () => {
  it('says there are no other families yet when the directory is empty', async () => {
    renderSearch();
    await listSettles();

    expect(screen.getByRole('status')).toHaveTextContent(/^No other families yet\. They'll show up here as they join\.$/);
    expect(centre().queryByRole('list')).not.toBeInTheDocument();
  });

  it('replaces the count line with a filtered empty line', async () => {
    signIn({ ...OAKLAND_USER, city: 'Fresno' });
    browseReturns(DIRECTORY);
    renderSearch('/search?near=1&open=1');
    await listSettles();

    expect(screen.getByRole('status').parentElement).toHaveTextContent(
      /^No families in Fresno, CA are open for playdates right now\.$/,
    );
  });

  it.each([
    ['/search?near=1', 'No other families in Oakland, CA yet.'],
    ['/search?open=1', 'No families are open for playdates right now.'],
    ['/search?q=zz&near=1', 'No families in Oakland, CA matched “zz”.'],
    ['/search?q=zz&open=1', 'No families open for playdates matched “zz”.'],
    ['/search?q=zz&near=1&open=1', 'No families open for playdates in Oakland, CA matched “zz”.'],
  ])('uses the empty line for %s', async (route, line) => {
    signIn();
    searchReturns([]);

    renderSearch(route);
    await listSettles();

    expect(screen.getByRole('status')).toHaveTextContent(line);
    expect(screen.queryByText('Try a name, a city, or a few words from their bio.')).not.toBeInTheDocument();
  });

  it('adds the hint under the no-match line when no filter is on', async () => {
    searchReturns([]);

    renderSearch('/search?q=zz');
    await listSettles();

    expect(screen.getByRole('status')).toHaveTextContent(/^No families matched “zz”\.$/);
    expect(centre().getByText('Try a name, a city, or a few words from their bio.')).toBeInTheDocument();
  });

  it('shows a fixed error for the browse list and reloads it with Try again', async () => {
    let calls = 0;
    server.use(
      http.get(`${FUNCTIONS_BASE}/community/recent`, () => {
        calls += 1;
        return calls === 1 ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json([ANDERSON]);
      }),
    );
    renderSearch();
    const user = userEvent.setup();
    const alert = await centre().findByRole('alert');
    const block = screen.getByRole('status').closest('[tabindex="-1"]');

    await user.click(centre().getByRole('button', { name: 'Try again' }));

    expect(alert).toHaveTextContent("We couldn't load families. Try again in a moment.");
    expect(block).not.toBe(screen.getByRole('main'));
    expect(block).toHaveFocus();
    expect(await centre().findByRole('link', { name: 'The Anderson family' })).toBeInTheDocument();
    expect(centre().queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the status element empty while the list error shows', async () => {
    server.use(http.get(`${FUNCTIONS_BASE}/community/recent`, () => HttpResponse.json({ error: 'boom' }, { status: 500 })));

    renderSearch();
    await centre().findByRole('alert');

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows a fixed error, not the raw message, when a search fails', async () => {
    server.use(http.get(`${FUNCTIONS_BASE}/search/families`, () => HttpResponse.json({ error: 'boom' }, { status: 500 })));

    renderSearch('/search?q=anderson');

    expect(await centre().findByRole('alert')).toHaveTextContent("We couldn't run that search. Try again in a moment.");
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });
});

describe('SearchPage open playdates rail', () => {
  const slot = (id: string, start: string | null) =>
    family({ id: `f-${id}`, name: id, nextFreeSlotId: `slot-${id}`, nextFreeSlotStart: start });

  const requestLinks = () =>
    within(rail().getByRole('list'))
      .getAllByRole('listitem')
      .map((row) => within(row).getByRole('link').getAttribute('href'));

  it('lists only families whose slot starts after now and within the next 7 days', async () => {
    browseReturns([
      slot('Past', '2026-10-05T08:00:00'),
      slot('TooLate', '2026-10-12T09:00:01'),
      slot('NoStart', null),
      slot('LastMoment', '2026-10-12T09:00:00'),
      slot('Today', '2026-10-05T17:00:00'),
    ]);

    renderSearch();
    await listSettles();

    expect(requestLinks()).toEqual(['/family/f-Today?requestSlot=slot-Today', '/family/f-LastMoment?requestSlot=slot-LastMoment']);
  });

  it('caps the list at five families, soonest first', async () => {
    browseReturns([
      slot('Day6', '2026-10-11T09:00:00'),
      slot('Day1', '2026-10-06T09:00:00'),
      slot('Day3', '2026-10-08T09:00:00'),
      slot('Day5', '2026-10-10T09:00:00'),
      slot('Day4', '2026-10-09T09:00:00'),
      slot('Day2', '2026-10-07T09:00:00'),
    ]);

    renderSearch();
    await listSettles();

    expect(requestLinks()).toEqual([1, 2, 3, 4, 5].map((day) => `/family/f-Day${day}?requestSlot=slot-Day${day}`));
  });

  it('shows the family name, the slot day and time, and a Request link to the request flow', async () => {
    browseReturns([ANDERSON, KURATA]);

    renderSearch();
    await listSettles();

    const [first, second] = within(rail().getByRole('list')).getAllByRole('listitem');
    expect(first).toHaveTextContent('Anderson');
    expect(first).toHaveTextContent('Wed, Oct 7 · 3:30pm');
    expect(second).toHaveTextContent('Sat, Oct 10 · 10am');
    const request = rail().getByRole('link', { name: 'Request a playdate with Anderson on Wednesday, October 7 at 3:30pm' });
    expect(request).toHaveAttribute('href', '/family/f-anderson?requestSlot=slot-a');
    expect(request).toHaveTextContent('Request');
  });

  it('sizes the badge text in rem, so it follows the font size the reader has set', async () => {
    browseReturns([ANDERSON]);

    renderSearch();
    await listSettles();

    expect(rail().getByRole('link', { name: /^Request a playdate with Anderson/ })).toHaveClass('text-[0.625rem]');
  });

  it('is not narrowed by the filters or the query', async () => {
    signIn();
    browseReturns(DIRECTORY);
    searchReturns([RIVERA]);

    renderSearch('/search?q=rivera&near=1');
    await centre().findByText('No families in Oakland, CA matched “rivera”.');

    expect(await rail().findAllByRole('listitem')).toHaveLength(3);
  });

  it('shows an empty line when no family has a slot this week', async () => {
    browseReturns([RIVERA, PATEL]);

    renderSearch();
    await listSettles();

    expect(rail().getByText('No free slots in the next 7 days.')).toBeInTheDocument();
    expect(rail().queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows an error line when it cannot load', async () => {
    server.use(http.get(`${FUNCTIONS_BASE}/community/recent`, () => HttpResponse.json({ error: 'boom' }, { status: 500 })));

    renderSearch();

    expect(await rail().findByText("We couldn't load open playdates.")).toBeInTheDocument();
  });

  it('hides its loading text visually and keeps the footer link in every state', async () => {
    browseReturns([]);

    renderSearch();
    const loadingText = rail().getByText('Loading open playdates…');
    const footerWhileLoading = rail().getByRole('link', { name: 'Your playdates →' });
    await listSettles();

    expect(loadingText).toHaveClass('sr-only');
    expect(footerWhileLoading).toHaveAttribute('href', '/playdates');
    expect(rail().getByRole('link', { name: 'Your playdates →' })).toHaveAttribute('href', '/playdates');
  });

  it('treats avatars as decoration', async () => {
    browseReturns([{ ...ANDERSON, avatarUrl: 'https://example.com/a.png' }]);

    const { container } = renderSearch();
    await listSettles();

    expect(container.querySelectorAll('img[alt=""]')).toHaveLength(2);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('SearchPage structure', () => {
  it('has one h1 and a level-2 heading for each column', async () => {
    signIn();
    browseReturns(DIRECTORY);

    renderSearch();
    await listSettles();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Find a family' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Filter' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Families' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Open for playdates this week' })).toBeInTheDocument();
  });

  it('never repeats an id although both filter presentations are in the DOM', async () => {
    signIn({ ...OAKLAND_USER, state: '' });
    browseReturns(DIRECTORY);
    const user = userEvent.setup();

    const { container } = renderSearch();
    await listSettles();
    await submitQuery(user, 'a');
    await screen.findByRole('alert');

    const ids = Array.from(container.querySelectorAll('[id]'), (el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never puts a link or a button inside another', async () => {
    signIn();
    browseReturns(DIRECTORY);

    const { container } = renderSearch();
    await listSettles();

    const nested = Array.from(container.querySelectorAll('a, button')).filter((el) => el.parentElement?.closest('a, button'));
    expect(nested).toEqual([]);
  });

  it('has no axe violations with families, badges and rail rows on screen', async () => {
    signIn();
    browseReturns(DIRECTORY);

    const { container } = renderSearch('/search?near=1');
    await listSettles();

    await expectNoA11yViolations(container);
  });

  it('has no axe violations when Near me is unavailable and the list failed', async () => {
    signIn({ ...OAKLAND_USER, city: '', state: '' });
    server.use(http.get(`${FUNCTIONS_BASE}/community/recent`, () => HttpResponse.json({ error: 'boom' }, { status: 500 })));

    const { container } = renderSearch();
    await centre().findByRole('alert');

    await expectNoA11yViolations(container);
  });
});

// Added by qa-engineer for search-browse-directory: one block per gap found
// when mapping the acceptance criteria to the tests above.

const RECENT_URL = `${FUNCTIONS_BASE}/community/recent`;
const FAMILIES_URL = `${FUNCTIONS_BASE}/search/families`;
const NO_SLOTS_LINE = 'No free slots in the next 7 days.';

/** A family whose next free slot starts at `start`. */
function withSlot(name: string, start: string | null, overrides: Record<string, unknown> = {}) {
  return family({ id: `f-${name}`, name, nextFreeSlotId: `slot-${name}`, nextFreeSlotStart: start, ...overrides });
}

/** Names on the cards that show the playdate badge, top to bottom. */
const badgedNames = () =>
  cards()
    .filter((card) => within(card).queryByText('🗓 Playdate') !== null)
    .map((card) => within(card).getByRole('link').textContent);

/** Family ids in the rail, top to bottom; [] when it shows no rows. */
const railFamilyIds = () =>
  rail()
    .queryAllByRole('link', { name: /^Request a playdate/ })
    .map((link) => /^\/family\/([^?]+)/.exec(link.getAttribute('href') ?? '')?.[1]);

const nearMeBox = () => filterCard().getByRole('checkbox', { name: 'Near me' });
const openBox = () => filterCard().getByRole('checkbox', { name: 'Open for playdates' });

function BackButton() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Back
    </button>
  );
}

function renderSearchWithBack(route: string) {
  return renderWithProviders(
    <>
      <SearchPage />
      <LocationProbe />
      <BackButton />
    </>,
    { route },
  );
}

// jsdom applies no CSS, so these pin the classes that produce the layout. The
// rendered widths and the breakpoint itself can only be checked in a browser.
describe('SearchPage layout', () => {
  it('uses the wide 1100px layout', async () => {
    renderSearch();
    await listSettles();

    expect(screen.getByRole('main')).toHaveClass('max-w-[1100px]');
  });

  it("puts filters, families and the rail, in that order, on Home's three-column grid", async () => {
    renderSearch();
    await listSettles();
    const families = screen.getByRole('region', { name: 'Families' });

    const grid = families.parentElement;

    expect(grid).toHaveClass('grid', 'grid-cols-1', 'md:grid-cols-[240px_minmax(0,1fr)_240px]');
    expect(Array.from(grid?.children ?? [])).toEqual([
      screen.getByRole('complementary', { name: 'Filters' }),
      families,
      screen.getByRole('complementary', { name: 'Open for playdates this week' }),
    ]);
  });

  it('hides both side columns below md', async () => {
    renderSearch();
    await listSettles();

    expect(screen.getByRole('complementary', { name: 'Filters' })).toHaveClass('hidden', 'md:block');
    expect(screen.getByRole('complementary', { name: 'Open for playdates this week' })).toHaveClass('hidden', 'md:block');
  });

  it('keeps the filters reachable below md in a bar between the search form and the count line', async () => {
    renderSearch();
    await listSettles();
    const bar = screen.getByRole('group', { name: 'Filters' });

    const afterForm = screen.getByRole('search').compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING;
    const beforeCount = bar.compareDocumentPosition(screen.getByRole('status')) & Node.DOCUMENT_POSITION_FOLLOWING;

    expect(bar).toHaveClass('md:hidden');
    expect(bar).not.toHaveClass('hidden');
    expect(screen.getByRole('region', { name: 'Families' })).toContainElement(bar);
    expect([afterForm, beforeCount]).toEqual([Node.DOCUMENT_POSITION_FOLLOWING, Node.DOCUMENT_POSITION_FOLLOWING]);
  });

  it('clamps the bio on a card to two lines', async () => {
    browseReturns([ANDERSON]);

    renderSearch();
    await listSettles();

    expect(within(cards()[0]!).getByText('Fostering since 2019.')).toHaveClass('line-clamp-2');
  });
});

describe('SearchPage rows from an older or untidy backend', () => {
  it('reads a null city and state as no location', async () => {
    browseReturns([family({ id: 'f-null', name: 'Null', city: null, state: null })]);

    renderSearch();
    await listSettles();

    expect(within(cards()[0]!).getByRole('link')).toHaveAccessibleDescription('');
  });

  it('reads a city of only spaces as no city', async () => {
    browseReturns([family({ id: 'f-blank', name: 'Blank', city: '   ', state: 'TX' })]);

    renderSearch();
    await listSettles();

    expect(within(cards()[0]!).getByRole('link')).toHaveAccessibleDescription('TX');
  });

  it.each([
    ['a Z', '2026-10-07T15:30:00Z'],
    ['milliseconds and a Z', '2026-10-07T15:30:00.000Z'],
    ['an offset', '2026-10-07T15:30:00-07:00'],
    ['a date only', '2026-10-07'],
    ['a space instead of the T', '2026-10-07 15:30:00'],
    ['no seconds', '2026-10-07T15:30'],
    ['nothing in it', ''],
  ])('treats a next free slot start with %s as no slot', async (_label, start) => {
    browseReturns([withSlot('Odd', start)]);

    renderSearch();
    await listSettles();

    expect(badgedNames()).toEqual([]);
    expect(rail().getByText(NO_SLOTS_LINE)).toBeInTheDocument();
  });

  it('treats a start that arrives without a slot id as no slot', async () => {
    browseReturns([
      family({ id: 'f-noid', name: 'NoId', nextFreeSlotStart: '2026-10-07T15:30:00' }),
      family({ id: 'f-emptyid', name: 'EmptyId', nextFreeSlotId: '', nextFreeSlotStart: '2026-10-07T15:30:00' }),
    ]);

    renderSearch();
    await listSettles();

    expect(badgedNames()).toEqual([]);
    expect(rail().getByText(NO_SLOTS_LINE)).toBeInTheDocument();
  });

  // What the functions deployed today return: community rows already carry a
  // slot id but no start; search rows carry none of the four new fields.
  it('matches nothing with Open for playdates while the backend sends no slot start', async () => {
    browseReturns([{ ...sampleResult[0], id: 'f-live', name: 'Lee', city: 'Denver', state: 'CO', nextFreeSlotId: 'slot-live' }]);

    renderSearch('/search?open=1');
    await listSettles();

    expect(screen.getByRole('status')).toHaveTextContent(/^No families are open for playdates right now\.$/);
    expect(rail().getByText(NO_SLOTS_LINE)).toBeInTheDocument();
  });

  it('matches nothing with Near me while search rows carry no location', async () => {
    signIn();
    searchReturns(sampleResult);

    renderSearch('/search?q=garcia&near=1');
    await listSettles();

    expect(screen.getByRole('status')).toHaveTextContent(/^No families in Oakland, CA matched “garcia”\.$/);
  });
});

describe('SearchPage slot timing', () => {
  it('counts a slot as open only when it starts after now, to the second', async () => {
    browseReturns([withSlot('StartsNow', '2026-10-05T09:00:00'), withSlot('InASecond', '2026-10-05T09:00:01')]);

    renderSearch();
    await listSettles();

    expect(badgedNames()).toEqual(['The InASecond family']);
    expect(railFamilyIds()).toEqual(['f-InASecond']);
  });

  it('leaves a family whose slot has started, or has no start, out of Open for playdates', async () => {
    browseReturns([
      withSlot('Started', '2026-10-05T08:59:59'),
      withSlot('NoStart', null),
      withSlot('Upcoming', '2026-10-05T17:00:00'),
      family({ id: 'f-none', name: 'None' }),
    ]);

    renderSearch('/search?open=1');
    await listSettles();

    expect(cardNames()).toEqual(['The Upcoming family']);
    expect(screen.getByRole('status')).toHaveTextContent(/^1 family open for playdates$/);
  });

  it('treats a started slot as no slot on query results as well', async () => {
    searchReturns([withSlot('Started', '2026-10-05T08:59:59'), withSlot('Upcoming', '2026-10-05T17:00:00')]);

    renderSearch('/search?q=an');
    await centre().findByRole('link', { name: 'The Upcoming family' });

    expect(badgedNames()).toEqual(['The Upcoming family']);
  });

  it('shows the badge for a slot that is too far off for the rail', async () => {
    browseReturns([withSlot('NextMonth', '2026-11-20T10:00:00')]);

    renderSearch();
    await listSettles();

    expect(badgedNames()).toEqual(['The NextMonth family']);
    expect(railFamilyIds()).toEqual([]);
  });
});

describe('SearchPage Near me matching', () => {
  it('needs both the city and the state to match', async () => {
    signIn();
    browseReturns([
      family({ id: 'f-1', name: 'Here', city: 'Oakland', state: 'CA' }),
      family({ id: 'f-2', name: 'OtherState', city: 'Oakland', state: 'MD' }),
      family({ id: 'f-3', name: 'OtherCity', city: 'Berkeley', state: 'CA' }),
      family({ id: 'f-4', name: 'NoState', city: 'Oakland', state: '' }),
      family({ id: 'f-5', name: 'NoCity', city: '', state: 'CA' }),
    ]);

    renderSearch('/search?near=1');
    await listSettles();

    expect(cardNames()).toEqual(['The Here family']);
  });

  it('ignores case and surrounding spaces on both sides', async () => {
    signIn({ ...OAKLAND_USER, city: ' Oakland ', state: 'ca' });
    browseReturns([
      family({ id: 'f-1', name: 'Loud', city: 'OAKLAND', state: 'CA' }),
      family({ id: 'f-2', name: 'Padded', city: ' oakland ', state: ' Ca ' }),
      family({ id: 'f-3', name: 'Longer', city: 'Oaklands', state: 'CA' }),
    ]);

    renderSearch('/search?near=1');
    await listSettles();

    expect(cardNames()).toEqual(['The Loud family', 'The Padded family']);
  });

  it('keeps the sort note on a filtered browse count', async () => {
    signIn();
    browseReturns(DIRECTORY);

    renderSearch('/search?near=1');
    await listSettles();

    expect(screen.getByRole('status').parentElement).toHaveTextContent(/^3 families in Oakland, CA · newest first$/);
  });
});

describe('SearchPage filters with a query', () => {
  const MATCHES = [ANDERSON, RIVERA, NGUYEN, PATEL];
  const BOTH_FILTERS_COUNT = /^1 matching family open for playdates in Oakland, CA, for “an”$/;

  it('applies Open for playdates to query results', async () => {
    signIn();
    searchReturns(MATCHES);
    renderSearch('/search?q=an');
    const user = userEvent.setup();
    await centre().findByRole('link', { name: 'The Rivera family' });

    await user.click(openBox());

    expect(cardNames()).toEqual(['The Anderson family', 'The Nguyen family']);
    expect(screen.getByRole('status')).toHaveTextContent(/^2 matching families open for playdates, for “an”$/);
    expect(urlSearch()).toBe('?q=an&open=1');
  });

  it('loads a URL that carries the query and both filters', async () => {
    signIn();
    let receivedQ: string | null = null;
    server.use(
      http.get(FAMILIES_URL, ({ request }) => {
        receivedQ = new URL(request.url).searchParams.get('q');
        return HttpResponse.json(MATCHES);
      }),
    );

    renderSearch('/search?q=an&near=1&open=1');
    await centre().findByRole('link', { name: 'The Anderson family' });

    expect(receivedQ).toBe('an');
    expect(screen.getByLabelText('Search')).toHaveValue('an');
    expect(nearMeBox()).toBeChecked();
    expect(openBox()).toBeChecked();
    expect(cardNames()).toEqual(['The Anderson family']);
    expect(screen.getByRole('status')).toHaveTextContent(BOTH_FILTERS_COUNT);
    expect(urlSearch()).toBe('?q=an&near=1&open=1');
  });

  it('keeps the query when the filters are cleared', async () => {
    signIn();
    searchReturns(MATCHES);
    renderSearch('/search?q=an&near=1&open=1');
    const user = userEvent.setup();
    await centre().findByRole('link', { name: 'The Anderson family' });

    await user.click(filterCard().getByRole('button', { name: 'Clear filters' }));

    expect(urlSearch()).toBe('?q=an');
    expect(screen.getByLabelText('Search')).toHaveValue('an');
    expect(cards()).toHaveLength(4);
  });

  it('keeps the filters when a query is submitted', async () => {
    signIn();
    browseReturns(DIRECTORY);
    searchReturns(MATCHES);
    renderSearch('/search?near=1&open=1');
    const user = userEvent.setup();
    await listSettles();

    await submitQuery(user, 'an');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(BOTH_FILTERS_COUNT));
    expect(urlSearch()).toBe('?q=an&near=1&open=1');
  });

  it('keeps the filters when the query is cleared', async () => {
    signIn();
    browseReturns(DIRECTORY);
    searchReturns(MATCHES);
    renderSearch('/search?q=an&open=1');
    const user = userEvent.setup();
    await centre().findByRole('link', { name: 'The Anderson family' });

    await submitQuery(user, '');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^3 families open for playdates$/));
    expect(urlSearch()).toBe('?open=1');
  });
});

describe('SearchPage URL state', () => {
  it('removes a filter from the URL when it is switched off', async () => {
    signIn();
    browseReturns(DIRECTORY);
    renderSearch('/search?near=1&open=1');
    const user = userEvent.setup();
    await listSettles();

    await user.click(nearMeBox());

    expect(urlSearch()).toBe('?open=1');
    expect(cardNames()).toEqual(['The Anderson family', 'The Kurata family', 'The Nguyen family']);
  });

  it('treats a one-character q in the URL as no query', async () => {
    let searched = false;
    server.use(
      http.get(FAMILIES_URL, () => {
        searched = true;
        return HttpResponse.json([]);
      }),
    );
    browseReturns([RIVERA]);

    renderSearch('/search?q=a');

    expect(await centre().findByRole('link', { name: 'The Rivera family' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/^1 family$/);
    expect(screen.getByLabelText('Search')).toHaveValue('');
    expect(searched).toBe(false);
  });

  it('trims the q found in the URL before searching', async () => {
    let receivedQ: string | null = null;
    server.use(
      http.get(FAMILIES_URL, ({ request }) => {
        receivedQ = new URL(request.url).searchParams.get('q');
        return HttpResponse.json([ANDERSON]);
      }),
    );

    renderSearch('/search?q=%20%20an%20');
    await centre().findByRole('link', { name: 'The Anderson family' });

    expect(receivedQ).toBe('an');
    expect(screen.getByLabelText('Search')).toHaveValue('an');
  });

  it('switches a filter on only for the value 1', async () => {
    signIn();
    browseReturns(DIRECTORY);

    renderSearch('/search?near=true&open=yes');
    await listSettles();

    expect(nearMeBox()).not.toBeChecked();
    expect(openBox()).not.toBeChecked();
    expect(cards()).toHaveLength(5);
  });

  it('leaves params it does not own in place when a filter changes', async () => {
    browseReturns(DIRECTORY);
    renderSearch('/search?ref=home');
    const user = userEvent.setup();
    await listSettles();

    await user.click(openBox());

    expect(urlSearch()).toBe('?ref=home&open=1');
  });

  it('keeps text typed but not yet submitted when a filter changes', async () => {
    browseReturns(DIRECTORY);
    renderSearch();
    const user = userEvent.setup();
    await listSettles();
    await user.type(screen.getByLabelText('Search'), 'anders');

    await user.click(openBox());

    expect(screen.getByLabelText('Search')).toHaveValue('anders');
    expect(urlSearch()).toBe('?open=1');
  });

  it('adds a history entry for a submitted query, so Back restores the previous list and the search box', async () => {
    signIn();
    browseReturns(DIRECTORY);
    searchReturns([RIVERA]);
    renderSearchWithBack('/search?open=1');
    const user = userEvent.setup();
    await listSettles();
    await submitQuery(user, 'rivera');
    await waitFor(() => expect(urlSearch()).toBe('?q=rivera&open=1'));

    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(screen.getByLabelText('Search')).toHaveValue(''));
    expect(urlSearch()).toBe('?open=1');
    expect(cardNames()).toEqual(['The Anderson family', 'The Kurata family', 'The Nguyen family']);
  });

  it('replaces the history entry when a filter changes, so Back skips over filter changes', async () => {
    browseReturns(DIRECTORY);
    searchReturns([ANDERSON, RIVERA]);
    renderSearchWithBack('/search');
    const user = userEvent.setup();
    await listSettles();
    await submitQuery(user, 'an');
    await centre().findByRole('link', { name: 'The Rivera family' });
    await user.click(openBox());
    await user.click(openBox());
    await user.click(openBox());

    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(urlSearch()).toBe(''));
    expect(screen.getByRole('status')).toHaveTextContent(/^5 families$/);
  });
});

describe('SearchPage Near me without a location on file', () => {
  const REASON = "We don't have a city and state for your family.";
  const NOWHERE = { ...OAKLAND_USER, city: '', state: '' };

  it.each([
    ['no state', { city: 'Oakland', state: '' }],
    ['neither a city nor a state', { city: '', state: '' }],
    ['a city of only spaces', { city: '   ', state: 'CA' }],
  ])('is unavailable with %s, and near=1 in the URL is ignored', async (_label, place) => {
    signIn({ ...OAKLAND_USER, ...place });
    browseReturns(DIRECTORY);

    renderSearch('/search?near=1');
    await listSettles();

    expect(nearMeBox()).toHaveAttribute('aria-disabled', 'true');
    expect(nearMeBox()).not.toBeChecked();
    expect(nearMeBox()).toHaveAccessibleDescription(REASON);
    expect(screen.getByRole('status')).toHaveTextContent(/^5 families$/);
  });

  it('stays in the tab order and cannot be switched on from the keyboard', async () => {
    signIn(NOWHERE);
    browseReturns(DIRECTORY);
    renderSearch();
    const user = userEvent.setup();
    await listSettles();
    act(() => openBox().focus());

    await user.tab({ shift: true });
    await user.keyboard(' ');

    expect(nearMeBox()).toHaveFocus();
    expect(nearMeBox()).not.toBeChecked();
    expect(urlSearch()).toBe('');
    expect(cards()).toHaveLength(5);
  });

  it('leaves Open for playdates working and names no place in the count line', async () => {
    signIn(NOWHERE);
    browseReturns(DIRECTORY);
    renderSearch('/search?near=1');
    const user = userEvent.setup();
    await listSettles();

    await user.click(openBox());

    expect(screen.getByRole('status')).toHaveTextContent(/^3 families open for playdates$/);
    expect(openBox()).toBeChecked();
  });

  it('leaves Clear filters unavailable when the only filter in the URL is an ignored near=1', async () => {
    signIn(NOWHERE);
    browseReturns(DIRECTORY);

    renderSearch('/search?near=1');
    await listSettles();

    expect(filterCard().getByRole('button', { name: 'Clear filters' })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('SearchPage now', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Runs the rest of the test in `zone`, at 03:15:20 UTC on Monday 5 October 2026. */
  function inZone(zone: string) {
    vi.stubEnv('TZ', zone);
    vi.setSystemTime(Date.UTC(2026, 9, 5, 3, 15, 20));
  }

  // The wall clock differs from UTC in each zone, and in Los Angeles the
  // calendar date does too, so a `now` built from UTC cannot pass.
  it.each([
    ['America/Los_Angeles', '2026-10-04T20:15:20'],
    ['Asia/Tokyo', '2026-10-05T12:15:20'],
    ['Pacific/Kiritimati', '2026-10-05T17:15:20'],
  ])('sends the wall-clock time in %s, not UTC, to both endpoints', async (zone, wallClock) => {
    inZone(zone);
    const sent: Record<string, string | null> = {};
    server.use(
      http.get(RECENT_URL, ({ request }) => {
        sent.browse = new URL(request.url).searchParams.get('now');
        return HttpResponse.json([]);
      }),
      http.get(FAMILIES_URL, ({ request }) => {
        sent.search = new URL(request.url).searchParams.get('now');
        return HttpResponse.json([]);
      }),
    );

    renderSearch('/search?q=an');

    await waitFor(() => expect(sent).toEqual({ browse: wallClock, search: wallClock }));
  });

  it('counts a slot later this evening as open in a zone behind UTC, where UTC is already tomorrow', async () => {
    inZone('America/Los_Angeles');
    browseReturns([withSlot('Tonight', '2026-10-04T21:00:00')]);

    renderSearch();
    await listSettles();

    expect(badgedNames()).toEqual(['The Tonight family']);
    expect(railFamilyIds()).toEqual(['f-Tonight']);
  });

  it('counts a slot from this morning as started in a zone ahead of UTC, where UTC is still earlier', async () => {
    inZone('Asia/Tokyo');
    browseReturns([withSlot('ThisMorning', '2026-10-05T09:00:00')]);

    renderSearch();
    await listSettles();

    expect(badgedNames()).toEqual([]);
    expect(railFamilyIds()).toEqual([]);
  });

  it('ends the rail window at the same clock time 7 days on, across the end of daylight saving', async () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    // Wednesday 28 October 2026, 09:00; clocks go back on Sunday 1 November.
    vi.setSystemTime(new Date(2026, 9, 28, 9, 0, 0));
    browseReturns([
      withSlot('TooLate', '2026-11-04T09:00:01'),
      withSlot('LastMoment', '2026-11-04T09:00:00'),
      withSlot('HalfHourBefore', '2026-11-04T08:30:00'),
    ]);

    renderSearch();
    await listSettles();

    expect(railFamilyIds()).toEqual(['f-HalfHourBefore', 'f-LastMoment']);
  });

  it('does not ask either endpoint again as time passes, because now is in neither query key', async () => {
    const calls = { browse: 0, search: 0 };
    server.use(
      http.get(RECENT_URL, () => {
        calls.browse += 1;
        return HttpResponse.json(DIRECTORY);
      }),
      http.get(FAMILIES_URL, () => {
        calls.search += 1;
        return HttpResponse.json([ANDERSON, RIVERA]);
      }),
    );
    renderSearch('/search?q=an');
    const user = userEvent.setup();
    await centre().findByRole('link', { name: 'The Rivera family' });
    await rail().findAllByRole('listitem');

    vi.setSystemTime(new Date(2026, 9, 5, 9, 30, 0));
    await user.click(openBox());

    expect(screen.getByRole('status')).toHaveTextContent(/^1 matching family open for playdates, for “an”$/);
    expect(rail().queryByText('Loading open playdates…')).not.toBeInTheDocument();
    expect(calls).toEqual({ browse: 1, search: 1 });
  });

  it('judges a slot against the clock at the latest render, without a new request', async () => {
    let calls = 0;
    server.use(
      http.get(RECENT_URL, () => {
        calls += 1;
        return HttpResponse.json([withSlot('Soon', '2026-10-05T09:10:00')]);
      }),
    );
    renderSearch();
    const user = userEvent.setup();
    await listSettles();
    const badgedAtNine = badgedNames();

    vi.setSystemTime(new Date(2026, 9, 5, 9, 10, 0));
    await user.click(openBox());

    expect(badgedAtNine).toEqual(['The Soon family']);
    expect(screen.getByRole('status')).toHaveTextContent(/^No families are open for playdates right now\.$/);
    expect(calls).toBe(1);
  });

  it('reads the clock again for a retried request', async () => {
    const sent: (string | null)[] = [];
    server.use(
      http.get(RECENT_URL, ({ request }) => {
        sent.push(new URL(request.url).searchParams.get('now'));
        return sent.length === 1 ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json([ANDERSON]);
      }),
    );
    renderSearch();
    const user = userEvent.setup();
    await centre().findByRole('alert');

    vi.setSystemTime(new Date(2026, 9, 5, 9, 5, 30));
    await user.click(centre().getByRole('button', { name: 'Try again' }));
    await centre().findByRole('link', { name: 'The Anderson family' });

    expect(sent).toEqual(['2026-10-05T09:00:00', '2026-10-05T09:05:30']);
  });
});

describe('SearchPage open playdates rail, more', () => {
  it('orders slots on the same day by start time', async () => {
    browseReturns([
      withSlot('Afternoon', '2026-10-06T14:00:00'),
      withSlot('Morning', '2026-10-06T09:30:00'),
      withSlot('Noon', '2026-10-06T12:00:00'),
    ]);

    renderSearch();
    await listSettles();

    expect(railFamilyIds()).toEqual(['f-Morning', 'f-Noon', 'f-Afternoon']);
  });

  it('shows the empty line when every slot falls outside the window', async () => {
    browseReturns([withSlot('Started', '2026-10-05T08:00:00'), withSlot('TooLate', '2026-10-13T09:00:00')]);

    renderSearch();
    await listSettles();

    expect(rail().getByText(NO_SLOTS_LINE)).toBeInTheDocument();
  });

  it('keeps its rows while a search fails', async () => {
    browseReturns(DIRECTORY);
    server.use(http.get(FAMILIES_URL, () => HttpResponse.json({ error: 'boom' }, { status: 500 })));

    renderSearch('/search?q=an');
    await centre().findByRole('alert');

    expect(railFamilyIds()).toEqual(['f-anderson', 'f-kurata', 'f-nguyen']);
  });

  it('shows its own error while query results load fine', async () => {
    server.use(http.get(RECENT_URL, () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    searchReturns([ANDERSON]);

    renderSearch('/search?q=an');
    await centre().findByRole('link', { name: 'The Anderson family' });

    expect(await rail().findByText("We couldn't load open playdates.")).toBeInTheDocument();
    expect(centre().queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('SearchPage loading and retry, more', () => {
  it('marks the list and the rail busy only while they load', async () => {
    browseReturns(DIRECTORY);

    const { container } = renderSearch();
    const busyWhileLoading = container.querySelectorAll('[aria-busy="true"]').length;
    await listSettles();

    expect(busyWhileLoading).toBe(2);
    expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(0);
  });

  it('keeps the rail loading text outside the busy wrapper, where assistive technology may hold content back', async () => {
    browseReturns(DIRECTORY);

    renderSearch();
    const busyAncestor = rail().getByText('Loading open playdates…').closest('[aria-busy="true"]');
    await listSettles();

    expect(busyAncestor).toBeNull();
  });

  it('re-runs a failed search with Try again, without reloading the browse list', async () => {
    const calls = { browse: 0, search: 0 };
    server.use(
      http.get(RECENT_URL, () => {
        calls.browse += 1;
        return HttpResponse.json(DIRECTORY);
      }),
      http.get(FAMILIES_URL, () => {
        calls.search += 1;
        return calls.search === 1 ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json([ANDERSON]);
      }),
    );
    renderSearch('/search?q=anderson');
    const user = userEvent.setup();
    await centre().findByRole('alert');
    await rail().findAllByRole('listitem');

    await user.click(centre().getByRole('button', { name: 'Try again' }));

    expect(await centre().findByRole('link', { name: 'The Anderson family' })).toBeInTheDocument();
    expect(calls).toEqual({ browse: 1, search: 2 });
  });
});

interface BlockButtonProps {
  familyId: string;
}

/** Blocks a family the way the family page does, through the shared mutation. */
function BlockButton({ familyId }: BlockButtonProps) {
  const block = useBlockFamilyMutation();
  return (
    <button type="button" onClick={() => block.mutate(familyId)}>
      Block
    </button>
  );
}

describe('SearchPage after the user blocks a family', () => {
  it('asks both endpoints again, so the family the server now leaves out goes from the list and the rail', async () => {
    let blocked = false;
    const unlessBlocked = <Row extends { id: string }>(rows: Row[]) =>
      blocked ? rows.filter((row) => row.id !== 'f-anderson') : rows;
    server.use(
      http.get(RECENT_URL, () => HttpResponse.json(unlessBlocked(DIRECTORY))),
      http.get(FAMILIES_URL, () => HttpResponse.json(unlessBlocked([ANDERSON, RIVERA]))),
      http.post(`${FUNCTIONS_BASE}/moderation/blocks`, () => {
        blocked = true;
        return HttpResponse.json(
          { blockerFamilyId: 'f-me', blockedFamilyId: 'f-anderson', createdAt: '2026-10-05T16:00:00+00:00' },
          { status: 201 },
        );
      }),
    );
    renderWithProviders(
      <>
        <SearchPage />
        <BlockButton familyId="f-anderson" />
      </>,
      { route: '/search?q=an' },
    );
    const user = userEvent.setup();
    await centre().findByRole('link', { name: 'The Anderson family' });
    await rail().findAllByRole('listitem');

    await user.click(screen.getByRole('button', { name: 'Block' }));

    await waitFor(() => expect(cardNames()).toEqual(['The Rivera family']));
    await waitFor(() => expect(railFamilyIds()).toEqual(['f-kurata', 'f-nguyen']));
  });
});

describe('SearchPage accessibility in the remaining audit states', () => {
  it('has no axe violations in a filtered empty state', async () => {
    signIn({ ...OAKLAND_USER, city: 'Fresno' });
    browseReturns(DIRECTORY);

    const { container } = renderSearch('/search?near=1&open=1');
    await listSettles();

    await expectNoA11yViolations(container);
  });

  it('has no axe violations on filtered query results', async () => {
    signIn();
    browseReturns(DIRECTORY);
    searchReturns([ANDERSON, RIVERA, NGUYEN]);

    const { container } = renderSearch('/search?q=an&open=1');
    await centre().findByRole('link', { name: 'The Anderson family' });

    await expectNoA11yViolations(container);
  });
});
