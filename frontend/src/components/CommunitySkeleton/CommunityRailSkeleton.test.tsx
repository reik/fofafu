import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CommunityRailSkeleton } from './CommunityRailSkeleton';

describe('CommunityRailSkeleton', () => {
  it('renders 5 skeleton rows, matching the approved mock', () => {
    const { container } = render(<CommunityRailSkeleton />);
    expect(container.querySelectorAll('li')).toHaveLength(5);
  });
});
