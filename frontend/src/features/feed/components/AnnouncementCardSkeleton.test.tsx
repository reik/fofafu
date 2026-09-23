import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnouncementCardSkeleton, AnnouncementFeedSkeleton } from './AnnouncementCardSkeleton';

describe('AnnouncementCardSkeleton', () => {
  it('is hidden from the accessibility tree so it never competes with real content', () => {
    const { container } = render(<AnnouncementCardSkeleton />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    // No interactive elements — a screen reader user tabbing through the
    // page should never land on a skeleton bone.
    expect(container.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0);
  });

  it('renders bones with the pulse animation disabled under prefers-reduced-motion', () => {
    const { container } = render(<AnnouncementCardSkeleton />);
    const bone = container.querySelector('.bg-surface-subtle');
    expect(bone).toHaveClass('animate-pulse');
    expect(bone).toHaveClass('motion-reduce:animate-none');
  });

  it('does not render a media placeholder by default', () => {
    render(<AnnouncementCardSkeleton />);
    expect(screen.queryByTestId('announcement-card-skeleton-media')).not.toBeInTheDocument();
  });

  it('renders a media placeholder block when withMedia is set', () => {
    render(<AnnouncementCardSkeleton withMedia />);
    expect(screen.getByTestId('announcement-card-skeleton-media')).toBeInTheDocument();
  });

  it('clamps the number of body lines to between 2 and 4', () => {
    const { container: tooFew } = render(<AnnouncementCardSkeleton lines={0} />);
    const { container: tooMany } = render(<AnnouncementCardSkeleton lines={10} />);
    // 2 header bones (avatar counts separately) + N body lines + 3 reaction pills;
    // simplest robust check: body-line container is the 2nd direct child.
    const fewBodyLines = tooFew.querySelectorAll('[aria-hidden="true"] > div')[1]?.children.length;
    const manyBodyLines = tooMany.querySelectorAll('[aria-hidden="true"] > div')[1]?.children.length;
    expect(fewBodyLines).toBe(2);
    expect(manyBodyLines).toBe(4);
  });
});

describe('AnnouncementFeedSkeleton', () => {
  it('renders three skeleton cards, at least one with a media block', () => {
    render(<AnnouncementFeedSkeleton />);
    const cards = screen.getAllByTestId('announcement-card-skeleton');
    expect(cards).toHaveLength(3);
    expect(screen.getByTestId('announcement-card-skeleton-media')).toBeInTheDocument();
  });
});
