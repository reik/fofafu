import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommunityRowSkeleton, CommunityRailSkeleton } from './CommunityRowSkeleton';

describe('CommunityRowSkeleton', () => {
  it('is hidden from the accessibility tree and has no interactive elements', () => {
    render(<CommunityRowSkeleton />);
    const row = screen.getByTestId('community-skeleton-row');
    expect(row).toHaveAttribute('aria-hidden', 'true');
    expect(row.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0);
  });

  it('disables the pulse animation under prefers-reduced-motion', () => {
    render(<CommunityRowSkeleton />);
    const row = screen.getByTestId('community-skeleton-row');
    const bone = row.querySelector('div');
    expect(bone).toHaveClass('animate-pulse');
    expect(bone).toHaveClass('motion-reduce:animate-none');
  });
});

describe('CommunityRailSkeleton', () => {
  it('renders multiple skeleton rows', () => {
    render(<CommunityRailSkeleton />);
    expect(screen.getAllByTestId('community-skeleton-row').length).toBeGreaterThanOrEqual(3);
  });
});
