import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse, delay, type JsonBodyType } from 'msw';
import { server, FUNCTIONS_BASE } from '@/tests/msw-server';
import { communityKeys } from '@/api/community';
import { SuggestedFamiliesCard } from './SuggestedFamiliesCard';

const HEADING = 'Families to say hi to';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` `offset` local days from today. */
function localDay(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

function floating(d: Date, clock: string): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${clock}`;
}

function suggestion(overrides: Record<string, unknown>) {
  return {
    id: 'f-n',
    ownerId: 'u-ngu',
    name: 'Nguyen Family',
    bio: '',
    kidCount: null,
    avatarUrl: null,
    isOwner: false,
    updatedAt: '2026-11-01T00:00:00Z',
    city: 'Oakland',
    state: 'CA',
    nextFreeSlotId: null,
    nextFreeSlotStart: null,
    reason: 'same_city',
    ...overrides,
  };
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SuggestedFamiliesCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

function respondWith(body: JsonBodyType, status = 200) {
  server.use(http.get(`${FUNCTIONS_BASE}/community/suggested`, () => HttpResponse.json(body, { status })));
}

async function renderSettled() {
  const utils = renderCard();
  await waitFor(() => {
    const status = utils.queryClient.getQueryState(communityKeys.suggested)?.status;
    expect(status === 'success' || status === 'error').toBe(true);
  });
  return utils;
}

async function reasonLineFor(row: Record<string, unknown>): Promise<HTMLElement> {
  respondWith([suggestion(row)]);
  renderCard();
  const card = await screen.findByRole('complementary', { name: HEADING });
  return within(card).getByRole('listitem');
}

describe('SuggestedFamiliesCard', () => {
  it('should_render_nothing_while_the_request_is_pending', () => {
    server.use(
      http.get(`${FUNCTIONS_BASE}/community/suggested`, async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
    );
    renderCard();
    expect(screen.queryByRole('complementary', { name: HEADING })).not.toBeInTheDocument();
    expect(screen.queryByText(HEADING)).not.toBeInTheDocument();
  });

  it('should_render_nothing_when_the_request_fails', async () => {
    respondWith({ error: 'boom' }, 500);
    const { container, queryClient } = await renderSettled();
    expect(queryClient.getQueryState(communityKeys.suggested)?.status).toBe('error');
    expect(screen.queryByText(HEADING)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('should_render_nothing_when_no_family_qualifies', async () => {
    respondWith([]);
    const { container, queryClient } = await renderSettled();
    expect(queryClient.getQueryState(communityKeys.suggested)?.status).toBe('success');
    expect(screen.queryByText(HEADING)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('should_render_a_complementary_landmark_named_by_its_heading_when_families_qualify', async () => {
    respondWith([suggestion({})]);
    renderCard();
    const card = await screen.findByRole('complementary', { name: HEADING });
    expect(within(card).getByRole('heading', { level: 2, name: HEADING })).toBeInTheDocument();
  });

  it('should_show_at_most_three_families', async () => {
    respondWith([
      suggestion({ id: 'a', ownerId: 'ua', name: 'A Family' }),
      suggestion({ id: 'b', ownerId: 'ub', name: 'B Family' }),
      suggestion({ id: 'c', ownerId: 'uc', name: 'C Family' }),
      suggestion({ id: 'd', ownerId: 'ud', name: 'D Family' }),
    ]);
    renderCard();
    const card = await screen.findByRole('complementary', { name: HEADING });
    expect(within(card).getAllByRole('listitem')).toHaveLength(3);
  });

  it('should_wrap_long_names_and_reasons_instead_of_cutting_them_to_one_line', async () => {
    respondWith([suggestion({ name: 'The Okafor-Whitfield Family', reason: 'same_city', city: 'Portland' })]);
    renderCard();
    const name = await screen.findByText('The Okafor-Whitfield Family');
    expect(name).not.toHaveClass('truncate');
    expect(name).toHaveClass('line-clamp-2', 'break-words');
    expect(screen.getByText('Also in Portland')).not.toHaveClass('truncate');
    expect(screen.getByText('Also in Portland').parentElement).not.toHaveClass('truncate');
  });

  it('should_offer_one_message_link_per_row_to_the_owner_thread', async () => {
    respondWith([suggestion({})]);
    renderCard();
    const card = await screen.findByRole('complementary', { name: HEADING });
    const links = within(card).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Message Nguyen Family');
    expect(links[0]).toHaveAttribute('href', '/messages/u-ngu');
    expect(within(card).getByText('Nguyen Family')).toBeInTheDocument();
  });

  it('should_say_also_in_city_for_a_same_city_family', async () => {
    const row = await reasonLineFor({ reason: 'same_city', city: 'Oakland', state: 'CA' });
    expect(row).toHaveTextContent('Also in Oakland');
  });

  it('should_fall_back_to_the_state_for_a_same_city_family_with_a_blank_city', async () => {
    const row = await reasonLineFor({ reason: 'same_city', city: '', state: 'CA' });
    expect(row).toHaveTextContent('Also in CA');
  });

  it('should_say_also_in_state_for_a_same_state_family', async () => {
    const row = await reasonLineFor({ reason: 'same_state', city: 'Salem', state: 'OR' });
    expect(row).toHaveTextContent('Also in OR');
  });

  it('should_show_no_reason_for_a_same_state_family_with_a_blank_state', async () => {
    const row = await reasonLineFor({ reason: 'same_state', city: '', state: '' });
    expect(row).not.toHaveTextContent(/Also in/);
  });

  it('should_say_recently_updated_for_a_recent_family', async () => {
    const row = await reasonLineFor({ reason: 'recent' });
    expect(row).toHaveTextContent('Recently updated their page');
  });

  it('should_show_no_reason_for_an_unknown_reason', async () => {
    const row = await reasonLineFor({ reason: 'mystery_rule' });
    // The leading "N" is the avatar's aria-hidden initial.
    expect(row).toHaveTextContent(/^N?Nguyen FamilyMessage$/);
  });

  it('should_name_the_weekday_for_an_open_slot_less_than_a_week_away', async () => {
    const day = localDay(2);
    const row = await reasonLineFor({ reason: 'open_slot', nextFreeSlotStart: floating(day, '10:00:00') });
    const weekday = day.toLocaleDateString('en-US', { weekday: 'short' });
    const spoken = day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    expect(within(row).getByText(`Open ${weekday} 10am`)).toHaveAttribute('aria-hidden', 'true');
    expect(within(row).getByText(`Open for a playdate ${spoken} at 10am`)).toHaveClass('sr-only');
  });

  it('should_name_the_date_for_an_open_slot_a_week_or_more_away', async () => {
    const day = localDay(9);
    const row = await reasonLineFor({ reason: 'open_slot', nextFreeSlotStart: floating(day, '14:30:00') });
    const monthDay = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    expect(within(row).getByText(`Open ${monthDay}, 2:30pm`)).toBeInTheDocument();
  });

  it('should_show_no_reason_for_an_open_slot_already_in_the_past', async () => {
    const row = await reasonLineFor({ reason: 'open_slot', nextFreeSlotStart: floating(localDay(-1), '10:00:00') });
    expect(row).not.toHaveTextContent(/Open/);
  });
});
