import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE } from '@/tests/msw-server';
import { BlockedContentPlaceholder } from './BlockedContentPlaceholder';

describe('BlockedContentPlaceholder', () => {
  it('renders the blocked notice with Undo and a link to the family profile', () => {
    renderWithProviders(<BlockedContentPlaceholder familyId="f-anderson" familyName="Anderson" />);

    expect(screen.getByRole('status')).toHaveTextContent(
      "You've blocked the Anderson family — their posts are now hidden.",
    );
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view their profile/i })).toHaveAttribute('href', '/family/f-anderson');
  });

  it('Undo calls unblock with the canonical family id and swaps in a brief acknowledgment', async () => {
    let capturedId: string | null = null;
    server.use(
      http.delete(`${FUNCTIONS_BASE}/moderation/blocks/:blockedFamilyId`, ({ params }) => {
        capturedId = params.blockedFamilyId as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<BlockedContentPlaceholder familyId="f-anderson" familyName="Anderson" />);

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(await screen.findByText(/unblocked — the anderson family can see your posts and message you again/i)).toBeInTheDocument();
    expect(capturedId).toBe('f-anderson');
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });
});
