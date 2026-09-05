import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BlockedThreadBanner } from './BlockedThreadBanner';

describe('BlockedThreadBanner', () => {
  it('renders nothing when the partner is not blocked', () => {
    const { container } = render(<BlockedThreadBanner blocked={false} familyName="Anderson" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reads as "limited," not "ended," and reassures that history stays — per the resolved Open Question', () => {
    render(<BlockedThreadBanner blocked familyName="Anderson" />);

    expect(screen.getByText("You've limited this conversation with the Anderson family.")).toBeInTheDocument();
    expect(screen.getByText(/your message history stays here/i)).toBeInTheDocument();
    expect(screen.queryByText(/this conversation is gone/i)).not.toBeInTheDocument();
  });
});
