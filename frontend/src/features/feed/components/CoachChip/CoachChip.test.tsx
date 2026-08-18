import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expectNoA11yViolations } from '@/tests/a11y';
import { CoachChip } from './CoachChip';

const suggestion = { rewrite: 'The time you had with her mattered.', reasoning: '"At least" can shrink a loss.' };

describe('CoachChip', () => {
  it('renders the preface, the rewrite, and all four controls', () => {
    render(<CoachChip suggestion={suggestion} onAccept={vi.fn()} onEdit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText('One way to say it:')).toBeInTheDocument();
    expect(screen.getByText(suggestion.rewrite)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use this' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep mine' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Why this?' })).toBeInTheDocument();
  });

  it('renders as a labeled region so it is discoverable by assistive tech', () => {
    render(<CoachChip suggestion={suggestion} onAccept={vi.fn()} onEdit={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Suggested rewrite' })).toBeInTheDocument();
  });

  it('calls onAccept when Use this is clicked', async () => {
    const onAccept = vi.fn();
    const user = userEvent.setup();
    render(<CoachChip suggestion={suggestion} onAccept={onAccept} onEdit={vi.fn()} onDismiss={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Use this' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('calls onEdit when Edit is clicked', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<CoachChip suggestion={suggestion} onAccept={vi.fn()} onEdit={onEdit} onDismiss={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when Keep mine is clicked', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<CoachChip suggestion={suggestion} onAccept={vi.fn()} onEdit={vi.fn()} onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: 'Keep mine' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('starts with the reasoning collapsed, and Why this? expands it, flips aria-expanded, and swaps the label to Hide', async () => {
    const user = userEvent.setup();
    render(<CoachChip suggestion={suggestion} onAccept={vi.fn()} onEdit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.queryByText(suggestion.reasoning)).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Why this?' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    expect(screen.getByText(suggestion.reasoning)).toBeInTheDocument();
    const hideToggle = screen.getByRole('button', { name: 'Hide' });
    expect(hideToggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(hideToggle);
    expect(screen.queryByText(suggestion.reasoning)).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <CoachChip suggestion={suggestion} onAccept={vi.fn()} onEdit={vi.fn()} onDismiss={vi.fn()} />,
    );
    await expectNoA11yViolations(container);
  });
});
