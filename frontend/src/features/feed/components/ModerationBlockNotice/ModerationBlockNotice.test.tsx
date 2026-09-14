import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModerationBlockNotice, MODERATION_BLOCK_COPY } from './ModerationBlockNotice';

describe('ModerationBlockNotice', () => {
  it('renders the non-punitive block message as an assertive live region', () => {
    render(<ModerationBlockNotice id="block-1" />);

    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent(MODERATION_BLOCK_COPY.heading);
    expect(notice).toHaveTextContent(MODERATION_BLOCK_COPY.body);
    expect(notice).toHaveAttribute('id', 'block-1');
  });

  it('does not offer a dismiss / "post anyway" control', () => {
    render(<ModerationBlockNotice id="block-2" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('moves focus to itself on mount, for keyboard and screen-reader users', () => {
    render(<ModerationBlockNotice id="block-3" />);
    expect(screen.getByRole('alert')).toHaveFocus();
  });
});
