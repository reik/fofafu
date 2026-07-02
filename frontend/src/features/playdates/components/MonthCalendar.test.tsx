import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/tests/render';
import { MonthCalendar } from './MonthCalendar';
import type { AvailabilitySlot } from '@/types/playdates';

// June 2026
const MONTH_DATE = new Date('2026-06-15T00:00:00');

const FREE_SLOT: AvailabilitySlot = {
  id: 'slot-m1',
  familyId: 'f1',
  date: '2026-06-18',
  startTime: '10:00',
  endTime: '12:00',
  status: 'free',
  note: null,
  createdAt: '2026-06-15T00:00:00Z',
  updatedAt: '2026-06-15T00:00:00Z',
};

describe('MonthCalendar', () => {
  it('renders day-of-week headers', () => {
    renderWithProviders(
      <MonthCalendar monthDate={MONTH_DATE} slots={[]} mode="own" />,
    );
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
  });

  it('renders a chip for a free slot', () => {
    renderWithProviders(
      <MonthCalendar monthDate={MONTH_DATE} slots={[FREE_SLOT]} mode="own" />,
    );
    // Free slot chip shows start time
    expect(screen.getByRole('button', { name: /10am/i })).toBeInTheDocument();
  });

  it('calls onSlotClick when a free slot chip is clicked', async () => {
    const onSlotClick = vi.fn();
    renderWithProviders(
      <MonthCalendar
        monthDate={MONTH_DATE}
        slots={[FREE_SLOT]}
        mode="own"
        onSlotClick={onSlotClick}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /10am/i }));
    expect(onSlotClick).toHaveBeenCalledWith(FREE_SLOT);
  });

  it('calls onCellClick when an empty in-month cell is clicked in own mode', async () => {
    const onCellClick = vi.fn();
    renderWithProviders(
      <MonthCalendar
        monthDate={MONTH_DATE}
        slots={[]}
        mode="own"
        onCellClick={onCellClick}
      />,
    );
    const user = userEvent.setup();
    // June 1 is in-month, should be clickable in own mode
    const jun1 = screen.getByRole('button', { name: /add availability slot on 2026-06-01/i });
    await user.click(jun1);
    expect(onCellClick).toHaveBeenCalledWith('2026-06-01');
  });

  it('marks matching slots with a star in view mode', () => {
    const matchSet = new Set(['slot-m1']);
    renderWithProviders(
      <MonthCalendar
        monthDate={MONTH_DATE}
        slots={[FREE_SLOT]}
        mode="view"
        matchingSlotIds={matchSet}
      />,
    );
    expect(screen.getByLabelText('Matching slot')).toBeInTheDocument();
  });
});
