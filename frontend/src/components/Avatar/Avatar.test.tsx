import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renders an image with the avatarUrl as src when avatarUrl is set', () => {
    const { container } = render(<Avatar avatarUrl="https://example.com/pic.jpg" name="Garcia" />);
    // Decorative images use alt="" (matches FamilyHeader's pattern) so they
    // are exposed with role "presentation", not "img" — query the DOM node directly.
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://example.com/pic.jpg');
    expect(img).toHaveAttribute('alt', '');
  });

  it('renders the initial-letter circle when avatarUrl is null but name is present', () => {
    const { container } = render(<Avatar avatarUrl={null} name="Garcia" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('G')).toBeInTheDocument();
  });

  it('uppercases the first letter of the name for the initial-letter circle', () => {
    render(<Avatar avatarUrl={null} name="garcia" />);
    expect(screen.getByText('G')).toBeInTheDocument();
  });

  it('renders a neutral placeholder with no initials when both avatarUrl and name are null', () => {
    const { container } = render(<Avatar avatarUrl={null} name={null} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('');
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders a neutral placeholder when avatarUrl is null and name is undefined', () => {
    const { container } = render(<Avatar avatarUrl={null} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
