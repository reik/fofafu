import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/tests/render';
import { WeekCalendar, weekMonday } from './WeekCalendar';
import type { AvailabilitySlot } from '@/types/playdates';

// Monday 2026-06-15
const WEEK_START = new Date('2026-06-15T00:00:00');

const FREE_SLOT: AvailabilitySlot = {
  id: 'slot-1',
  familyId: 'f1',
  date: '2026-06-16', // Tuesday
  startTime: '10:00',
  endTime: '12:00',
  status: 'free',
  note: null,
  createdAt: '2026-06-15T00:00:00Z',
  updatedAt: '2026-06-15T00:00:00Z',
};

const BUSY_SLOT: AvailabilitySlot = {
  id: 'slot-2',
  familyId: 'f1',
  date: '2026-06-17', // Wednesday
  startTime: '14:00',
  endTime: '15:00',
  status: 'busy',
  note: 'Appointment',
  createdAt: '2026-06-15T00:00:00Z',
  updatedAt: '2026-06-15T00:00:00Z',
};

describe('WeekCalendar', () => {
  it('renders the 7-day header with Mon through Sun', () => {
    renderWithProviders(
      <WeekCalendar weekStart={WEEK_START} slots={[]} mode="own" />,
    );
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
  });

  it('renders a free slot as a clickable button', () => {
    renderWithProviders(
      <WeekCalendar weekStart={WEEK_START} slots={[FREE_SLOT]} mode="own" />,
    );
    // free slot aria-label contains the time
    expect(screen.getByRole('button', { name: /10am/i })).toBeInTheDocument();
  });

  it('calls onSlotClick when a free slot is clicked in own mode', async () => {
    const onSlotClick = vi.fn();
    renderWithProviders(
      <WeekCalendar
        weekStart={WEEK_START}
        slots={[FREE_SLOT]}
        mode="own"
        onSlotClick={onSlotClick}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /10am/i }));
    expect(onSlotClick).toHaveBeenCalledWith(FREE_SLOT);
  });

  it('calls onCellClick when an empty day cell is clicked in own mode', async () => {
    const onCellClick = vi.fn();
    renderWithProviders(
      <WeekCalendar
        weekStart={WEEK_START}
        slots={[]}
        mode="own"
        onCellClick={onCellClick}
      />,
    );
    const user = userEvent.setup();
    // Monday Jun 15 add-slot button
    const addButtons = screen.getAllByRole('button', { name: /add availability slot on 2026-06-15/i });
    const addBtn = addButtons[0];
    if (!addBtn) throw new Error('Add button not found');
    await user.click(addBtn);
    expect(onCellClick).toHaveBeenCalledWith('2026-06-15');
  });

  it('renders a busy slot in own mode (shows the slot block)', () => {
    renderWithProviders(
      <WeekCalendar weekStart={WEEK_START} slots={[BUSY_SLOT]} mode="own" />,
    );
    expect(screen.getByRole('button', { name: /2pm/i })).toBeInTheDocument();
  });

  it('calls onSlotClick for a free slot in view mode', async () => {
    const onSlotClick = vi.fn();
    renderWithProviders(
      <WeekCalendar
        weekStart={WEEK_START}
        slots={[FREE_SLOT]}
        mode="view"
        onSlotClick={onSlotClick}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /10am/i }));
    expect(onSlotClick).toHaveBeenCalledWith(FREE_SLOT);
  });

  it('does NOT render empty-cell add buttons in view mode', () => {
    renderWithProviders(
      <WeekCalendar weekStart={WEEK_START} slots={[]} mode="view" />,
    );
    expect(
      screen.queryByRole('button', { name: /add availability slot/i }),
    ).not.toBeInTheDocument();
  });

  it('marks matching slots with a star glyph', () => {
    const matchSet = new Set(['slot-1']);
    renderWithProviders(
      <WeekCalendar
        weekStart={WEEK_START}
        slots={[FREE_SLOT]}
        mode="view"
        matchingSlotIds={matchSet}
      />,
    );
    expect(screen.getByLabelText('Matching slot')).toBeInTheDocument();
  });

  it('weekMonday returns Monday for a Wednesday input', () => {
    const wednesday = new Date('2026-06-17T12:00:00');
    const monday = weekMonday(wednesday);
    expect(monday.getDay()).toBe(1); // 1 = Monday
    expect(monday.toISOString().slice(0, 10)).toBe('2026-06-15');
  });
});
