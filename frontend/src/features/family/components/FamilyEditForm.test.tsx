import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server, FUNCTIONS_BASE } from '@/tests/msw-server';
import { FamilyEditForm } from './FamilyEditForm';

const family = { id: 'f1', ownerId: 'u1', name: 'Garcia', bio: '', kidCount: null, avatarUrl: null, isOwner: true, updatedAt: '2026-05-17' };

describe('FamilyEditForm', () => {
  it('submits the patch and calls onSaved', async () => {
    let captured: unknown = null;
    server.use(
      http.patch(`${FUNCTIONS_BASE}/family/me`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ ...family, name: 'The Garcia Family', bio: 'updated bio', kidCount: 3 });
      }),
    );

    let saved = false;
    renderWithProviders(<FamilyEditForm family={family} onCancel={() => {}} onSaved={() => { saved = true; }} />);

    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/family name/i));
    await user.type(screen.getByLabelText(/family name/i), 'The Garcia Family');
    await user.type(screen.getByLabelText(/bio/i), 'updated bio');
    await user.type(screen.getByLabelText(/kids in placement/i), '3');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await screen.findByRole('button', { name: /save/i });
    expect(saved).toBe(true);
    expect(captured).toEqual({ name: 'The Garcia Family', bio: 'updated bio', kidCount: 3 });
  });

  it('rejects kid count out of range with field-level error', async () => {
    renderWithProviders(<FamilyEditForm family={family} onCancel={() => {}} onSaved={() => {}} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/kids in placement/i), '99');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/whole number 0/i)).toBeInTheDocument();
  });
});
