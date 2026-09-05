import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE, handlers } from '@/tests/msw-server';
import { FamilyProfileBlockControl } from './FamilyProfileBlockControl';

const FAMILY_ID = 'f-anderson';

describe('FamilyProfileBlockControl — not yet blocked', () => {
  it('renders "Block this family" and, on tap, blocks immediately with no confirmation dialog', async () => {
    server.use(
      handlers.moderationBlocksList([]),
      http.post(`${FUNCTIONS_BASE}/moderation/blocks`, () =>
        HttpResponse.json({ blockerFamilyId: 'f-me', blockedFamilyId: FAMILY_ID, createdAt: '2026-09-04T00:00:00Z' }, { status: 201 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<FamilyProfileBlockControl familyId={FAMILY_ID} familyName="Anderson" />);

    const button = screen.getByRole('button', { name: 'Block this family' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(button);

    expect(await screen.findByRole('button', { name: 'Unblock' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/blocked — you won't see the anderson family anymore/i);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByText(/you've blocked the anderson family\./i)).toBeInTheDocument();
  });

  it('Undo reverses the block and shows a brief "Unblocked" acknowledgment', async () => {
    server.use(
      handlers.moderationBlocksList([]),
      http.post(`${FUNCTIONS_BASE}/moderation/blocks`, () =>
        HttpResponse.json({ blockerFamilyId: 'f-me', blockedFamilyId: FAMILY_ID, createdAt: '2026-09-04T00:00:00Z' }, { status: 201 }),
      ),
      http.delete(`${FUNCTIONS_BASE}/moderation/blocks/${FAMILY_ID}`, () => new HttpResponse(null, { status: 204 })),
    );
    const user = userEvent.setup();
    renderWithProviders(<FamilyProfileBlockControl familyId={FAMILY_ID} familyName="Anderson" />);

    await user.click(screen.getByRole('button', { name: 'Block this family' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(await screen.findByText(/unblocked — the anderson family can see your posts and message you again/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Block this family' })).toBeInTheDocument();
    expect(screen.queryByText(/you've blocked the anderson family\./i)).not.toBeInTheDocument();
  });

  it('surfaces the server\'s own error message and leaves the button usable again if the block request fails', async () => {
    server.use(
      handlers.moderationBlocksList([]),
      http.post(`${FUNCTIONS_BASE}/moderation/blocks`, () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
    );
    const user = userEvent.setup();
    renderWithProviders(<FamilyProfileBlockControl familyId={FAMILY_ID} familyName="Anderson" />);

    await user.click(screen.getByRole('button', { name: 'Block this family' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(screen.getByRole('button', { name: 'Block this family' })).toBeEnabled();
  });

  it('falls back to ux-writer\'s generic copy when the failure carries no server-provided message', async () => {
    server.use(handlers.moderationBlocksList([]), http.post(`${FUNCTIONS_BASE}/moderation/blocks`, () => HttpResponse.error()));
    const user = userEvent.setup();
    renderWithProviders(<FamilyProfileBlockControl familyId={FAMILY_ID} familyName="Anderson" />);

    await user.click(screen.getByRole('button', { name: 'Block this family' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't block that family. Try again?");
  });
});

describe('FamilyProfileBlockControl — already blocked', () => {
  it('renders "Unblock" and the durable blocked-status banner on load', async () => {
    server.use(handlers.moderationBlocksList([
      { blockerFamilyId: 'f-me', blockedFamilyId: FAMILY_ID, createdAt: '2026-09-01T00:00:00Z' },
    ]));
    renderWithProviders(<FamilyProfileBlockControl familyId={FAMILY_ID} familyName="Anderson" />);

    expect(await screen.findByRole('button', { name: 'Unblock' })).toBeInTheDocument();
    expect(screen.getByText(/you've blocked the anderson family\./i)).toBeInTheDocument();
    expect(screen.getByText(/they can't see your posts or message you\. you won't see theirs\./i)).toBeInTheDocument();
  });

  it('tapping Unblock reverses the block with no confirmation dialog', async () => {
    server.use(
      handlers.moderationBlocksList([
        { blockerFamilyId: 'f-me', blockedFamilyId: FAMILY_ID, createdAt: '2026-09-01T00:00:00Z' },
      ]),
      http.delete(`${FUNCTIONS_BASE}/moderation/blocks/${FAMILY_ID}`, () => new HttpResponse(null, { status: 204 })),
    );
    const user = userEvent.setup();
    renderWithProviders(<FamilyProfileBlockControl familyId={FAMILY_ID} familyName="Anderson" />);

    const unblockButton = await screen.findByRole('button', { name: 'Unblock' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(unblockButton);

    expect(await screen.findByText(/unblocked — the anderson family can see your posts and message you again/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Block this family' })).toBeInTheDocument();
  });
});
