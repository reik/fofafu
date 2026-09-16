import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CommunityRowSkeleton } from './CommunityRowSkeleton';

describe('CommunityRowSkeleton', () => {
  it('renders as a single aria-hidden row', () => {
    const { container } = render(<CommunityRowSkeleton />);
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders an avatar circle plus a name line and a location line', () => {
    const { container } = render(<CommunityRowSkeleton />);
    const bones = container.querySelectorAll('.rounded-full');
    // avatar + name + location = 3 rounded-full bones.
    expect(bones).toHaveLength(3);
  });
});
