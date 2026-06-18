import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server } from '@/tests/msw-server';
import { RequestCard } from './RequestCard';
import type { PlaydateRequest } from '@/types/playdates';

const BASE_REQUEST: PlaydateRequest = {
  id: 'req-1',
  requesterFamilyId: 'u-requester',
  ownerFamilyId: 'u-owner',
  slotId: 'slot-1',
  message: 'Park playdate?',
  status: 'pending',
  createdAt: '2026-06-14T10:00:00Z',
  updatedAt: '2026-06-14T10:00:00Z',
  requesterName: 'The Diaz family',
  ownerName: 'The Lee family',
  slotDate: '2026-06-20',
  slotStartTime: '14:00',
  slotEndTime: '16:00',
};

describe('RequestCard', () => {
  it('renders pending incoming request with Accept and Decline buttons for the owner', () => {
    renderWithProviders(
      <RequestCard request={BASE_REQUEST} myId="u-owner" onUpdate={vi.fn()} />,
    );
    // incoming means we ARE the owner — show the requester's name
    expect(screen.getByText('The Diaz family')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
  });

  it('renders outgoing pending request without Accept/Decline buttons for the requester', () => {
    renderWithProviders(
      <RequestCard request={BASE_REQUEST} myId="u-requester" onUpdate={vi.fn()} />,
    );
    // outgoing: show owner name
    expect(screen.getByText('The Lee family')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /decline/i })).not.toBeInTheDocument();
  });

  it('renders the optional message', () => {
    renderWithProviders(
      <RequestCard request={BASE_REQUEST} myId="u-owner" onUpdate={vi.fn()} />,
    );
    expect(screen.getByText(/park playdate/i)).toBeInTheDocument();
  });

  it('renders accepted status badge without action buttons', () => {
    const accepted = { ...BASE_REQUEST, status: 'accepted' as const };
    renderWithProviders(
      <RequestCard request={accepted} myId="u-owner" onUpdate={vi.fn()} />,
    );
    expect(screen.getByText('accepted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /decline/i })).not.toBeInTheDocument();
  });

  it('renders declined status badge without action buttons', () => {
    const declined = { ...BASE_REQUEST, status: 'declined' as const };
    renderWithProviders(
      <RequestCard request={declined} myId="u-owner" onUpdate={vi.fn()} />,
    );
    expect(screen.getByText('declined')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
  });

  it('calls onUpdate after accepting a request', async () => {
    const onUpdate = vi.fn();
    server.use(
      http.put('/api/playdates/requests/req-1/respond', () =>
        HttpResponse.json({ ...BASE_REQUEST, status: 'accepted' }, { status: 200 }),
      ),
    );
    renderWithProviders(
      <RequestCard request={BASE_REQUEST} myId="u-owner" onUpdate={onUpdate} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /accept/i }));
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
  });

  it('calls onUpdate after declining a request', async () => {
    const onUpdate = vi.fn();
    server.use(
      http.put('/api/playdates/requests/req-1/respond', () =>
        HttpResponse.json({ ...BASE_REQUEST, status: 'declined' }, { status: 200 }),
      ),
    );
    renderWithProviders(
      <RequestCard request={BASE_REQUEST} myId="u-owner" onUpdate={onUpdate} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /decline/i }));
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
  });
});
