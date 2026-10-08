import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommunityRowSkeleton, CommunityRailSkeleton } from './CommunityRowSkeleton';
import { installMatchMedia } from '@/tests/installMatchMedia';

describe('CommunityRowSkeleton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is hidden from the accessibility tree and has no interactive elements', () => {
    render(<CommunityRowSkeleton />);
    const row = screen.getByTestId('community-skeleton-row');
    expect(row).toHaveAttribute('aria-hidden', 'true');
    expect(row.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0);
  });

  it('carries the CSS reduced-motion fallback class regardless of preference', () => {
    installMatchMedia(false);
    render(<CommunityRowSkeleton />);
    const row = screen.getByTestId('community-skeleton-row');
    const bone = row.querySelector('div');
    expect(bone).toHaveClass('motion-reduce:animate-none');
  });

  it('applies the pulse animation when the OS has no reduced-motion preference', () => {
    installMatchMedia(false);
    render(<CommunityRowSkeleton />);
    const row = screen.getByTestId('community-skeleton-row');
    const bone = row.querySelector('div');
    expect(bone).toHaveClass('animate-pulse');
  });

  it('drops the pulse animation outright when the OS prefers reduced motion', () => {
    installMatchMedia(true);
    render(<CommunityRowSkeleton />);
    const row = screen.getByTestId('community-skeleton-row');
    const bone = row.querySelector('div');
    expect(bone).not.toHaveClass('animate-pulse');
  });
});

describe('CommunityRailSkeleton', () => {
  it('renders multiple skeleton rows', () => {
    render(<CommunityRailSkeleton />);
    expect(screen.getAllByTestId('community-skeleton-row').length).toBeGreaterThanOrEqual(3);
  });
});
