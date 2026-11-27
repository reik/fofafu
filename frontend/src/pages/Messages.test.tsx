import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE, handlers } from '@/tests/msw-server';
import { useAuthStore } from '@/stores/auth';
import { messageKeys } from '@/api/messages';
import { Layout } from '@/components/Layout';
import { MEDIA_LG, MEDIA_MD } from '@/hooks/useMediaQuery';
import MessagesPage from './Messages';

// ── Viewport ──────────────────────────────────────────────────────

const originalMatchMedia = window.matchMedia;

function setViewport({ md, lg }: { md: boolean; lg: boolean }): void {
  window.matchMedia = ((query: string) => ({
    matches: query === MEDIA_MD ? md : query === MEDIA_LG ? lg : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  useAuthStore.getState().clear();
});

// ── Data ──────────────────────────────────────────────────────────

const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

const THREADS = [
  { partnerId: 'u1', partnerName: 'Kuratars', lastMessage: "let me know if you don't mind", lastAt: ago(5), unreadCount: 3 },
  { partnerId: 'u2', partnerName: 'Anderson Family', lastMessage: 'Pizza night was a hit', lastAt: ago(600), unreadCount: 0 },
];

function message(id: string, partner: string, mine: boolean, content: string, mins: number, read = true) {
  return {
    id, from: mine ? 'me' : partner, fromName: mine ? 'Me' : 'Partner', to: mine ? partner : 'me', toName: 'x',
    content, read, createdAt: ago(mins), mine,
  };
}

const THREAD_U1 = [
  message('m1', 'u1', false, 'Hi there', 120),
  message('m2', 'u1', true, 'Hello back', 110),
  message('m3', 'u1', false, "let me know if you don't mind", 5),
];

function family(ownerId: string, id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id, ownerId, name, bio: '', kidCount: null, avatarUrl: null, isOwner: false,
    updatedAt: '2026-11-01T00:00:00Z', city: 'Oakland', state: 'CA', ...extra,
  };
}

interface MockOptions {
  threads?: JsonBodyType;
  threadU1?: JsonBodyType;
  suggested?: JsonBodyType;
  blocks?: JsonBodyType;
}

function mockApi({ threads = THREADS, threadU1 = THREAD_U1, suggested = [], blocks = [] }: MockOptions = {}) {
  server.use(
    http.get(`${FUNCTIONS_BASE}/message/threads`, () => HttpResponse.json(threads)),
    http.get(`${FUNCTIONS_BASE}/message/threads/u1`, () => HttpResponse.json(threadU1)),
    http.get(`${FUNCTIONS_BASE}/message/threads/u2`, () => HttpResponse.json([message('a1', 'u2', false, 'Pizza night was a hit', 600)])),
    http.get(`${FUNCTIONS_BASE}/message/threads/:id`, () => HttpResponse.json([])),
    http.post(`${FUNCTIONS_BASE}/message/threads/:id/read`, () => HttpResponse.json({ marked: 0 })),
    http.get(`${FUNCTIONS_BASE}/family/u1`, () => HttpResponse.json(family('u1', 'f-1', 'Kuratars'))),
    http.get(`${FUNCTIONS_BASE}/family/u2`, () => HttpResponse.json(family('u2', 'f-2', 'Anderson Family'))),
    http.get(`${FUNCTIONS_BASE}/family/u9`, () => HttpResponse.json(family('u9', 'f-9', 'Nguyen Family'))),
    http.get(`${FUNCTIONS_BASE}/playdates/availability/:id`, () => HttpResponse.json([])),
    http.get(`${FUNCTIONS_BASE}/community/suggested`, () => HttpResponse.json(suggested)),
    handlers.moderationBlocksList(blocks),
  );
}

// The real app's shape: both message routes mount the same page, and every
// other page brings its own Layout.
function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/', element: <Layout><h1>Home</h1></Layout> },
      { path: '/messages', element: <MessagesPage /> },
      { path: '/messages/:userId', element: <MessagesPage /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

function centerRegion(name: string | RegExp) {
  return screen.getByRole('region', { name });
}

function conversationLinks(): HTMLElement[] {
  return within(screen.getByRole('navigation', { name: 'Conversations' })).getAllByRole('link');
}

// ── Below md: today's two pages ───────────────────────────────────

describe('MessagesPage below md', () => {
  function setAuthed(): void {
    useAuthStore.getState().setAuth({
      token: 'jwt',
      user: { id: 'u-self', email: 'a@b.com', name: 'Self', city: 'Phoenix', state: 'AZ' },
    });
  }

  it('renders each thread row labeled with the partner family name and a link to /messages/:partnerId', async () => {
    setAuthed();
    server.use(
      handlers.messagesUnreadCount(0),
      http.get(`${FUNCTIONS_BASE}/message/threads`, () =>
        HttpResponse.json([
          { partnerId: 'u-partner-1', partnerName: 'The Garcias', lastMessage: 'see you sunday', lastAt: '2026-05-17T12:00:00Z', unreadCount: 1 },
        ]),
      ),
    );

    renderWithProviders(<MessagesPage />, { route: '/messages' });

    const link = await screen.findByRole('link', { name: /the garcias/i });
    expect(link).toHaveAttribute('href', '/messages/u-partner-1');
    // We must NOT show the raw partner UUID.
    expect(link.textContent ?? '').not.toContain('u-partner-1');
  });

  it('falls back to "A former member" when partnerName is null', async () => {
    setAuthed();
    server.use(
      handlers.messagesUnreadCount(0),
      http.get(`${FUNCTIONS_BASE}/message/threads`, () =>
        HttpResponse.json([
          { partnerId: 'u-partner-deleted', partnerName: null, lastMessage: 'last note', lastAt: '2026-05-17T12:00:00Z', unreadCount: 0 },
        ]),
      ),
    );

    renderWithProviders(<MessagesPage />, { route: '/messages' });

    const link = await screen.findByRole('link', { name: /a former member/i });
    expect(link).toHaveAttribute('href', '/messages/u-partner-deleted');
    expect(link.textContent ?? '').not.toContain('u-partner-deleted');
  });

  it('should_show_the_list_page_with_its_visible_title_and_no_conversation_or_rails', async () => {
    mockApi({ suggested: [family('u9', 'f-9', 'Nguyen Family', { reason: 'recent' })] });
    renderApp('/messages');
    expect(screen.getByRole('heading', { level: 1, name: 'Messages' })).not.toHaveClass('sr-only');
    expect(screen.getByText('Your private conversations with other foster families.')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /^Kuratars/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Conversation with/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('should_show_the_thread_page_with_a_back_link_and_no_list_or_rails', async () => {
    mockApi();
    renderApp('/messages/u1');
    expect(await screen.findByText('Hi there')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← All messages' })).toHaveAttribute('href', '/messages');
    expect(screen.queryByRole('navigation', { name: 'Conversations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('should_focus_main_when_moving_from_the_list_to_a_thread', async () => {
    mockApi();
    const user = userEvent.setup();
    renderApp('/messages');
    await user.click(await screen.findByRole('link', { name: /^Kuratars/ }));
    await screen.findByText('Hi there');
    expect(document.activeElement).toBe(document.getElementById('main'));
  });
});

describe('MessagesPage — blocked partner', () => {
  it('shows no "Blocked" tag/banner and keeps message history + composer when the partner is not blocked', async () => {
    mockApi();
    renderApp('/messages/u1');

    expect(await screen.findByText('Hi there')).toBeInTheDocument();
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
    expect(screen.queryByText(/you've limited this conversation/i)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^message/i })).toBeEnabled();
  });

  it('shows the header tag + limited-conversation banner while keeping history and an enabled composer (Variant B)', async () => {
    mockApi({ blocks: [{ blockerFamilyId: 'f-me', blockedFamilyId: 'f-1', createdAt: '2026-09-02T00:00:00Z' }] });
    renderApp('/messages/u1');

    expect(await screen.findByText('Blocked')).toBeInTheDocument();
    expect(await screen.findByText("You've limited this conversation with the Kuratars family.")).toBeInTheDocument();
    // History stays, unmodified, per the resolved Open Question.
    expect(screen.getByText('Hi there')).toBeInTheDocument();
    // Variant B: composer stays enabled — "Message this family" never disables.
    expect(screen.getByRole('textbox', { name: /^message/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /send/i })).toBeEnabled();
  });
});

// ── md and wider ──────────────────────────────────────────────────

describe('MessagesPage at md and wider', () => {
  beforeEach(() => setViewport({ md: true, lg: true }));

  it('should_lay_out_conversations_then_the_conversation_then_the_family_card', async () => {
    mockApi();
    renderApp('/messages/u1');
    const nav = screen.getByRole('navigation', { name: 'Conversations' });
    const center = await screen.findByRole('region', { name: 'Conversation with Kuratars' });
    const about = screen.getByRole('complementary', { name: 'About this family' });
    expect(nav.compareDocumentPosition(center) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(center.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Messages' })).toHaveClass('sr-only');
  });

  it('should_mark_only_the_selected_row_as_the_current_page', async () => {
    mockApi();
    renderApp('/messages/u1');
    await screen.findByRole('link', { name: /^Kuratars.*unread$/ });
    const current = conversationLinks().filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/^Kuratars/);
  });

  it('should_mark_no_row_as_current_with_nothing_selected', async () => {
    mockApi();
    renderApp('/messages');
    await screen.findByRole('link', { name: /^Kuratars/ });
    expect(conversationLinks().some((a) => a.hasAttribute('aria-current'))).toBe(false);
  });

  it('should_read_the_unread_count_at_the_end_of_the_row_link', async () => {
    mockApi();
    renderApp('/messages');
    expect(await screen.findByRole('link', { name: /^Kuratars.*3 unread$/ })).toHaveAttribute('href', '/messages/u1');
  });

  it('should_wrap_a_long_family_name_in_a_row_but_keep_the_preview_on_one_line', async () => {
    mockApi();
    renderApp('/messages');
    const row = await screen.findByRole('link', { name: /^Anderson/ });
    const name = within(row).getByText('Anderson Family');
    expect(name).not.toHaveClass('truncate');
    expect(name).toHaveClass('line-clamp-2', 'break-words');
    expect(within(row).getByText('Pizza night was a hit')).toHaveClass('truncate');
  });

  it('should_show_a_compact_last_active_date_on_a_read_row', async () => {
    const lastAt = new Date(Date.now() - 20 * 86_400_000);
    mockApi({ threads: [{ ...THREADS[1], lastAt: lastAt.toISOString() }] });
    renderApp('/messages');
    const row = await screen.findByRole('link', { name: /^Anderson/ });
    const label = lastAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const expected = lastAt.getFullYear() === new Date().getFullYear() ? label : `${label}, ${lastAt.getFullYear()}`;
    expect(within(row).getByText(expected)).toHaveAttribute('dateTime', lastAt.toISOString());
  });

  it('should_filter_conversations_by_name_and_announce_the_result', async () => {
    mockApi();
    const user = userEvent.setup();
    renderApp('/messages');
    await screen.findByRole('link', { name: /^Kuratars/ });
    const status = within(screen.getByRole('navigation', { name: 'Conversations' })).getByRole('status');
    expect(status).toBeEmptyDOMElement();

    await user.type(screen.getByRole('searchbox', { name: 'Search conversations' }), 'kur');
    expect(screen.queryByRole('link', { name: /^Anderson/ })).not.toBeInTheDocument();
    await waitFor(() => expect(status).toHaveTextContent('1 conversation'), { timeout: 2000 });

    await user.type(screen.getByRole('searchbox'), 'zzz');
    await waitFor(() => expect(status).toHaveTextContent('No conversations match “kurzzz”.'), { timeout: 2000 });
  });

  it('should_keep_the_filter_text_when_a_conversation_is_selected', async () => {
    mockApi();
    const user = userEvent.setup();
    renderApp('/messages');
    await user.type(await screen.findByRole('searchbox', { name: 'Search conversations' }), 'and');
    await user.click(screen.getByRole('link', { name: /^Anderson/ }));
    await screen.findByRole('region', { name: 'Conversation with Anderson Family' });
    expect(screen.getByRole('searchbox')).toHaveValue('and');
  });

  it('should_show_the_pick_a_conversation_state_with_nothing_selected', async () => {
    mockApi();
    renderApp('/messages');
    await screen.findByRole('link', { name: /^Kuratars/ });
    expect(centerRegion('Pick a conversation')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'About this family' })).not.toBeInTheDocument();
  });

  it('should_invite_a_first_conversation_when_there_are_no_threads', async () => {
    mockApi({ threads: [] });
    renderApp('/messages');
    expect(await screen.findByText('No conversations yet.')).toBeInTheDocument();
    const center = centerRegion('Start your first conversation');
    expect(within(center).getByRole('link', { name: 'Find a family' })).toHaveAttribute('href', '/search');
    expect(screen.getByRole('link', { name: 'New message' })).toHaveAttribute('href', '/search');
  });

  it('should_show_only_suggestions_in_the_right_column_with_nothing_selected', async () => {
    mockApi({ suggested: [family('u9', 'f-9', 'Nguyen Family', { reason: 'recent' })] });
    renderApp('/messages');
    expect(await screen.findByRole('complementary', { name: 'Families to say hi to' })).toBeInTheDocument();
    expect(screen.getAllByRole('complementary')).toHaveLength(1);
  });

  it('should_render_no_right_column_landmark_with_nothing_selected_and_no_suggestions', async () => {
    let served = false;
    mockApi();
    server.use(http.get(`${FUNCTIONS_BASE}/community/suggested`, () => { served = true; return HttpResponse.json([]); }));
    renderApp('/messages');
    await waitFor(() => expect(served).toBe(true));
    await act(async () => {});
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByText('Families to say hi to')).not.toBeInTheDocument();
  });

  it('should_leave_out_the_right_column_between_md_and_lg', async () => {
    setViewport({ md: true, lg: false });
    mockApi({ suggested: [family('u9', 'f-9', 'Nguyen Family', { reason: 'recent' })] });
    renderApp('/messages/u1');
    expect(await screen.findByRole('region', { name: 'Conversation with Kuratars' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('should_list_messages_in_order_with_spoken_senders_and_no_live_region_on_the_history', async () => {
    mockApi();
    renderApp('/messages/u1');
    const scroll = await screen.findByRole('region', { name: 'Messages' });
    expect(scroll).toHaveAttribute('tabindex', '0');
    const items = await within(scroll).findAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toMatch(/Kuratars: Hi there/);
    expect(items[1]?.textContent).toMatch(/You: Hello back/);
    let node: HTMLElement | null = scroll;
    while (node) {
      expect(node).not.toHaveAttribute('role', 'log');
      expect(node).not.toHaveAttribute('aria-live');
      node = node.parentElement;
    }
  });

  it('should_name_the_composer_after_the_partner', async () => {
    mockApi();
    renderApp('/messages/u1');
    expect(await screen.findByRole('textbox', { name: 'Message to Kuratars' })).toBeInTheDocument();
  });

  it('should_open_a_new_conversation_named_from_the_family_page_with_no_row_selected', async () => {
    mockApi();
    renderApp('/messages/u9');
    expect(await screen.findByRole('region', { name: 'Conversation with Nguyen Family' })).toBeInTheDocument();
    expect(await screen.findByText('No messages yet — say hi.')).toBeInTheDocument();
    await screen.findByRole('link', { name: /^Kuratars/ });
    expect(conversationLinks().some((a) => a.hasAttribute('aria-current'))).toBe(false);
  });

  it('should_announce_new_inbound_messages_in_the_open_thread_only', async () => {
    mockApi();
    const { queryClient, router } = renderApp('/messages/u1');
    await screen.findByText('Hi there');
    const status = within(centerRegion('Conversation with Kuratars')).getByRole('status');
    expect(status).toBeEmptyDOMElement();

    server.use(
      http.get(`${FUNCTIONS_BASE}/message/threads/u1`, () =>
        HttpResponse.json([...THREAD_U1, message('m4', 'u1', false, 'Are you there?', 1, false)]),
      ),
    );
    await act(() => queryClient.invalidateQueries({ queryKey: messageKeys.thread('u1') }));
    await waitFor(() => expect(status).toHaveTextContent('New message from Kuratars'));

    await act(() => router.navigate('/messages/u2'));
    const next = centerRegion('Conversation with Anderson Family');
    await within(next).findByText('Pizza night was a hit');
    expect(within(next).getByRole('status')).toBeEmptyDOMElement();
  });

  it('should_say_message_sent_after_a_send', async () => {
    mockApi();
    server.use(
      http.post(`${FUNCTIONS_BASE}/message`, () =>
        HttpResponse.json(message('m9', 'u1', true, 'On my way', 0), { status: 201 })),
    );
    const user = userEvent.setup();
    renderApp('/messages/u1');
    await user.type(await screen.findByRole('textbox', { name: 'Message to Kuratars' }), 'On my way');
    await user.click(screen.getByRole('button', { name: /send/i }));
    const status = within(centerRegion('Conversation with Kuratars')).getByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Message sent'));
  });
});

// ── Focus when the selection changes (Accessibility reqs 15–16) ───

describe('MessagesPage focus at md and wider', () => {
  beforeEach(() => setViewport({ md: true, lg: true }));

  it('should_leave_focus_alone_on_a_deep_link', async () => {
    mockApi();
    renderApp('/messages/u1');
    await screen.findByText('Hi there');
    expect(document.activeElement).toBe(document.body);
  });

  it('should_focus_the_new_conversation_when_a_row_is_clicked', async () => {
    mockApi();
    const user = userEvent.setup();
    renderApp('/messages/u1');
    await user.click(await screen.findByRole('link', { name: /^Anderson/ }));
    expect(document.activeElement).toBe(await screen.findByRole('region', { name: 'Conversation with Anderson Family' }));
  });

  it('should_focus_the_conversation_while_its_messages_are_still_loading', async () => {
    mockApi();
    server.use(http.get(`${FUNCTIONS_BASE}/message/threads/u2`, () => new Promise<never>(() => {})));
    const user = userEvent.setup();
    renderApp('/messages/u1');
    await user.click(await screen.findByRole('link', { name: /^Anderson/ }));
    expect(document.activeElement).toBe(centerRegion('Conversation with Anderson Family'));
  });

  it('should_focus_the_conversation_again_on_back_and_the_empty_state_at_the_list', async () => {
    mockApi();
    const user = userEvent.setup();
    const { router } = renderApp('/messages');
    await user.click(await screen.findByRole('link', { name: /^Kuratars/ }));
    await user.click(screen.getByRole('link', { name: /^Anderson/ }));

    await act(() => router.navigate(-1));
    expect(document.activeElement).toBe(centerRegion('Conversation with Kuratars'));

    await act(() => router.navigate(-1));
    expect(document.activeElement).toBe(centerRegion('Pick a conversation'));
  });

  it('should_focus_the_conversation_opened_from_a_suggestion', async () => {
    mockApi({ suggested: [family('u9', 'f-9', 'Nguyen Family', { reason: 'recent' })] });
    const user = userEvent.setup();
    renderApp('/messages');
    await user.click(await screen.findByRole('link', { name: 'Message Nguyen Family' }));
    expect(document.activeElement).toBe(await screen.findByRole('region', { name: 'Conversation with Nguyen Family' }));
  });
});
