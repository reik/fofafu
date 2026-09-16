import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AnnouncementCardSkeleton } from './AnnouncementCardSkeleton';

describe('AnnouncementCardSkeleton', () => {
  it('renders with aria-hidden so skeletons are not announced', () => {
    const { container } = render(<AnnouncementCardSkeleton />);
    const article = container.querySelector('article');
    expect(article).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the media bone only when hasMedia is true', () => {
    const { container, rerender } = render(<AnnouncementCardSkeleton />);
    expect(container.querySelector('[data-testid="skeleton-media"]')).not.toBeInTheDocument();

    rerender(<AnnouncementCardSkeleton hasMedia />);
    expect(container.querySelector('[data-testid="skeleton-media"]')).toBeInTheDocument();
  });

  it('respects the deprecated withMedia alias', () => {
    const { container } = render(<AnnouncementCardSkeleton withMedia />);
    expect(container.querySelector('[data-testid="skeleton-media"]')).toBeInTheDocument();
  });

  it('applies the motion-safe pulse animation class to bones', () => {
    const { container } = render(<AnnouncementCardSkeleton />);
    expect(container.querySelector('.motion-safe\\:animate-pulse')).toBeInTheDocument();
  });

  it('forwards an optional className', () => {
    const { container } = render(<AnnouncementCardSkeleton className="my-4" />);
    expect(container.querySelector('article')).toHaveClass('my-4');
  });

  it('forwards custom line widths and name width when provided', () => {
    const { container } = render(
      <AnnouncementCardSkeleton
        nameWidthClassName="w-40"
        lineWidthClassNames={['w-1/2', 'w-1/3']}
      />,
    );
    const article = container.querySelector('article');
    expect(article?.querySelector('.w-40')).toBeInTheDocument();
    expect(article?.querySelector('.w-1\\/2')).toBeInTheDocument();
    expect(article?.querySelector('.w-1\\/3')).toBeInTheDocument();
  });
});
