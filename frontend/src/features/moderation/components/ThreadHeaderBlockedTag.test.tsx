import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThreadHeaderBlockedTag } from './ThreadHeaderBlockedTag';

describe('ThreadHeaderBlockedTag', () => {
  it('renders nothing when the partner is not blocked', () => {
    const { container } = render(<ThreadHeaderBlockedTag blocked={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a "Blocked" pill when the partner is blocked', () => {
    render(<ThreadHeaderBlockedTag blocked />);
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });
});
