import { describe, it, expect } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse, delay, type JsonBodyType } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE, handlers } from '@/tests/msw-server';
import { AboutFamilyCard } from './AboutFamilyCard';

const PARTNER = 'u-k';
const HEADING = 'About this family';

const family = {
  id: 'f-k',
  ownerId: PARTNER,
  name: 'Kuratars',
  bio: 'New to fostering this year.',
  kidCount: null,
  avatarUrl: null,
  isOwner: false,
  updatedAt: '2026-11-01T00:00:00Z',
  city: 'Oakland',
  state: 'CA',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function slot(id: string, date: string, startTime: string, status: 'free' | 'busy' = 'free') {
  return {
    id,
    familyId: 'f-k',
    date,
    startTime,
    endTime: '23:59',
    status,
    note: null,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
}

function spoken(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function mock({
  familyBody = family as JsonBodyType,
  familyStatus = 200,
  slots = [] as JsonBodyType,
  slotsStatus = 200,
  blocks = [] as JsonBodyType,
} = {}) {
  server.use(
    http.get(`${FUNCTIONS_BASE}/family/${PARTNER}`, () => HttpResponse.json(familyBody, { status: familyStatus })),
    http.get(`${FUNCTIONS_BASE}/playdates/availability/${PARTNER}`, () => HttpResponse.json(slots, { status: slotsStatus })),
    handlers.moderationBlocksList(blocks),
  );
}

function renderCard(partnerName?: string | null) {
  return renderWithProviders(<AboutFamilyCard partnerId={PARTNER} partnerName={partnerName} />);
}

describe('AboutFamilyCard', () => {
  it('should_show_its_heading_and_a_loading_line_while_the_family_loads', () => {
    server.use(
      http.get(`${FUNCTIONS_BASE}/family/${PARTNER}`, async () => {
        await delay('infinite');
        return HttpResponse.json(family);
      }),
      handlers.moderationBlocksList([]),
    );
    renderCard('Kuratars');
    const card = screen.getByRole('complementary', { name: HEADING });
    expect(within(card).getByText('Loading family details…')).toBeInTheDocument();
  });

  it('should_show_the_family_name_location_and_bio', async () => {
    mock();
    renderCard('Kuratars');
    const card = screen.getByRole('complementary', { name: HEADING });
    expect(await within(card).findByText('Kuratars')).toBeInTheDocument();
    expect(within(card).getByText('Oakland, CA')).toBeInTheDocument();
    expect(within(card).getByText('New to fostering this year.')).toBeInTheDocument();
  });

  it('should_omit_the_location_line_when_city_and_state_are_missing', async () => {
    mock({ familyBody: { ...family, city: null, state: null } });
    renderCard('Kuratars');
    await screen.findByText('Kuratars');
    expect(screen.queryByText(/Oakland|CA/)).not.toBeInTheDocument();
  });

  it('should_say_so_when_the_family_has_no_bio', async () => {
    mock({ familyBody: { ...family, bio: '' } });
    renderCard('Kuratars');
    expect(await screen.findByText("This family hasn't added a bio yet.")).toBeInTheDocument();
  });

  it('should_list_up_to_three_upcoming_free_slots_soonest_first_with_request_links', async () => {
    const d1 = isoDay(1);
    const d2 = isoDay(2);
    const d3 = isoDay(3);
    mock({
      slots: [
        slot('s4', isoDay(4), '09:00'),
        slot('s3', d3, '14:00'),
        slot('busy', d1, '08:00', 'busy'),
        slot('past', isoDay(-1), '10:00'),
        slot('s1', d1, '10:00'),
        slot('s2', d2, '09:30'),
      ],
    });
    renderCard('Kuratars');
    expect(await screen.findByRole('heading', { level: 3, name: 'Open playdates' })).toBeInTheDocument();
    const requests = await screen.findAllByRole('link', { name: /^Request a playdate with Kuratars/ });
    expect(requests.map((a) => a.getAttribute('href'))).toEqual([
      '/family/f-k?requestSlot=s1',
      '/family/f-k?requestSlot=s2',
      '/family/f-k?requestSlot=s3',
    ]);
    expect(requests[0]).toHaveAccessibleName(`Request a playdate with Kuratars on ${spoken(d1)} at 10am`);
  });

  it('should_say_so_when_there_are_no_upcoming_free_slots', async () => {
    mock({ slots: [slot('busy', isoDay(1), '08:00', 'busy')] });
    renderCard('Kuratars');
    expect(await screen.findByText('No open playdates coming up.')).toBeInTheDocument();
  });

  it('should_say_so_when_the_slots_fail_to_load', async () => {
    mock({ slotsStatus: 500, slots: { error: 'boom' } });
    renderCard('Kuratars');
    expect(await screen.findByText("We couldn't load open playdates.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View family page for Kuratars' })).toBeInTheDocument();
  });

  it('should_link_to_the_family_page_with_a_label_that_starts_with_the_visible_text', async () => {
    mock();
    renderCard('Kuratars');
    const link = await screen.findByRole('link', { name: 'View family page for Kuratars' });
    expect(link).toHaveAttribute('href', '/family/f-k');
  });

  it('should_hide_open_playdates_for_a_blocked_partner', async () => {
    let blocksServed = false;
    let availabilityRequests = 0;
    server.use(
      http.get(`${FUNCTIONS_BASE}/family/${PARTNER}`, () => HttpResponse.json(family)),
      http.get(`${FUNCTIONS_BASE}/playdates/availability/${PARTNER}`, () => {
        availabilityRequests += 1;
        return HttpResponse.json([slot('s1', isoDay(1), '10:00')]);
      }),
      http.get(`${FUNCTIONS_BASE}/moderation/blocks`, () => {
        blocksServed = true;
        return HttpResponse.json([{ blockerFamilyId: 'f-me', blockedFamilyId: 'f-k', createdAt: '2026-11-01T00:00:00Z' }]);
      }),
    );
    renderCard('Kuratars');
    expect(await screen.findByRole('link', { name: 'View family page for Kuratars' })).toBeInTheDocument();
    await waitFor(() => expect(blocksServed).toBe(true));
    await act(async () => {});
    expect(screen.queryByRole('heading', { name: 'Open playdates' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Request/ })).not.toBeInTheDocument();
    expect(availabilityRequests).toBe(0);
  });

  it('should_say_the_page_is_not_set_up_when_the_partner_has_no_family', async () => {
    mock({ familyStatus: 404, familyBody: { error: 'Not found' } });
    renderCard('Kuratars');
    expect(await screen.findByText("This family hasn't set up their page yet.")).toBeInTheDocument();
    expect(screen.getByText('Kuratars')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /View family page/ })).not.toBeInTheDocument();
  });

  it('should_say_the_page_is_gone_for_a_former_member', async () => {
    mock({ familyStatus: 404, familyBody: { error: 'Not found' } });
    renderCard(null);
    expect(await screen.findByText("This family's page is no longer available.")).toBeInTheDocument();
    expect(screen.getByText('A former member')).toBeInTheDocument();
  });

  it('should_show_an_error_when_the_family_fails_to_load', async () => {
    mock({ familyStatus: 500, familyBody: { error: 'boom' } });
    renderCard('Kuratars');
    expect(await screen.findByText("We couldn't load this family's details.")).toBeInTheDocument();
  });
});
