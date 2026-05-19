import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/tests/render';
import { FamilyHeader } from './FamilyHeader';

const ownerFamily = { id: 'f1', ownerId: 'u1', name: 'Garcia', bio: 'caring for three teens', kidCount: 3, avatarUrl: null, isOwner: true,  updatedAt: '2026-05-17' };
const otherFamily = { id: 'f2', ownerId: 'u2', name: 'Lee',    bio: 'family of four',        kidCount: 2, avatarUrl: null, isOwner: false, updatedAt: '2026-05-17' };

describe('FamilyHeader', () => {
  it('shows the kid-count chip when viewer is the owner', () => {
    renderWithProviders(<FamilyHeader family={ownerFamily} />);
    expect(screen.getByLabelText(/3 children in placement/i)).toBeInTheDocument();
  });

  it('hides the kid-count chip for non-owners (privacy)', () => {
    renderWithProviders(<FamilyHeader family={{ ...otherFamily, kidCount: null }} />);
    expect(screen.queryByText(/kids in placement/i)).not.toBeInTheDocument();
    expect(screen.getByText(/the lee family/i)).toBeInTheDocument();
  });

  it('renders the bio placeholder when empty', () => {
    renderWithProviders(<FamilyHeader family={{ ...ownerFamily, bio: '' }} />);
    expect(screen.getByText(/tell us about your family/i)).toBeInTheDocument();
  });
});
