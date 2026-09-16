import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AnnouncementFeedSkeleton } from './AnnouncementFeedSkeleton';

describe('AnnouncementFeedSkeleton', () => {
  it('renders 2-3 skeleton cards per the acceptance criteria', () => {
    const { container } = render(<AnnouncementFeedSkeleton />);
    // Each AnnouncementCardSkeleton renders exactly one top-level aria-hidden card.
    const cards = container.querySelectorAll('[aria-hidden="true"]');
    // Cards themselves are aria-hidden; nested bones are also aria-hidden, so
    // scope to direct children of the wrapper instead of a global count.
    const topLevelCards = container.firstElementChild?.children ?? [];
    expect(topLevelCards.length).toBeGreaterThanOrEqual(2);
    expect(topLevelCards.length).toBeLessThanOrEqual(3);
    expect(cards.length).toBeGreaterThan(0);
  });

  it('includes at least one card with a media placeholder, since posts may carry images', () => {
    const { container } = render(<AnnouncementFeedSkeleton />);
    const mediaBlocks = container.querySelectorAll('[data-testid="skeleton-media"]');
    expect(mediaBlocks.length).toBeGreaterThanOrEqual(1);
  });
});
