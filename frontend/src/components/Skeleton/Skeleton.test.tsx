import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renders a bone hidden from assistive tech', () => {
    const { container } = render(<Skeleton />);
    const bone = container.firstElementChild;
    expect(bone).toHaveAttribute('aria-hidden', 'true');
  });

  it('defaults to a fully-rounded bar shape with the surface.subtle token', () => {
    const { container } = render(<Skeleton />);
    const bone = container.firstElementChild;
    expect(bone).toHaveClass('rounded-full', 'bg-surface-subtle');
  });

  it('only animates under motion-safe, so prefers-reduced-motion yields static bones', () => {
    const { container } = render(<Skeleton />);
    const bone = container.firstElementChild;
    expect(bone).toHaveClass('motion-safe:animate-pulse');
    expect(bone).not.toHaveClass('animate-pulse');
  });

  it('renders a block shape with the 8px card radius for media placeholders', () => {
    const { container } = render(<Skeleton shape="block" />);
    const bone = container.firstElementChild;
    expect(bone).toHaveClass('rounded');
    expect(bone).not.toHaveClass('rounded-full');
  });

  it('merges a caller-provided className for sizing', () => {
    const { container } = render(<Skeleton className="h-3 w-24" />);
    const bone = container.firstElementChild;
    expect(bone).toHaveClass('h-3', 'w-24');
  });
});
