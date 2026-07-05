import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/tests/render';
import { TimePicker } from './TimePicker';

describe('TimePicker', () => {
  it('renders the label', () => {
    renderWithProviders(<TimePicker label="Start time" value="10:00" onChange={vi.fn()} />);
    expect(screen.getByText('Start time')).toBeInTheDocument();
  });

  it('renders hour select, minute select, and AM/PM buttons', () => {
    renderWithProviders(<TimePicker label="Start time" value="10:00" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Start time hour')).toBeInTheDocument();
    expect(screen.getByLabelText('Start time minute')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PM' })).toBeInTheDocument();
  });

  it('parses 10:00 to display hour=10, minute=00, AM selected', () => {
    renderWithProviders(<TimePicker label="Start time" value="10:00" onChange={vi.fn()} />);
    const hourSelect = screen.getByLabelText('Start time hour') as HTMLSelectElement;
    expect(hourSelect.value).toBe('10');
    const minuteSelect = screen.getByLabelText('Start time minute') as HTMLSelectElement;
    expect(minuteSelect.value).toBe('00');
    expect(screen.getByRole('button', { name: 'AM' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'PM' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('parses 14:30 to display hour=2, minute=30, PM selected', () => {
    renderWithProviders(<TimePicker label="End time" value="14:30" onChange={vi.fn()} />);
    const hourSelect = screen.getByLabelText('End time hour') as HTMLSelectElement;
    expect(hourSelect.value).toBe('2');
    const minuteSelect = screen.getByLabelText('End time minute') as HTMLSelectElement;
    expect(minuteSelect.value).toBe('30');
    expect(screen.getByRole('button', { name: 'PM' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onChange with updated 24h string when period is toggled to PM', async () => {
    const onChange = vi.fn();
    renderWithProviders(<TimePicker label="Start time" value="10:00" onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'PM' }));
    // 10:00 AM → PM = 22:00
    expect(onChange).toHaveBeenCalledWith('22:00');
  });

  it('calls onChange with new value when hour changes', async () => {
    const onChange = vi.fn();
    renderWithProviders(<TimePicker label="Start time" value="10:00" onChange={onChange} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Start time hour'), '3');
    // 3:00 AM = 03:00
    expect(onChange).toHaveBeenCalledWith('03:00');
  });

  it('calls onChange when minute changes', async () => {
    const onChange = vi.fn();
    renderWithProviders(<TimePicker label="Start time" value="10:00" onChange={onChange} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Start time minute'), '30');
    // 10:30 AM = 10:30
    expect(onChange).toHaveBeenCalledWith('10:30');
  });
});
