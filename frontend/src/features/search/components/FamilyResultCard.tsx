import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '@/components/Avatar';
import { familyInitial, type DirectoryEntry } from '../hooks/useFamilyDirectory';
import { PlaydateBadge } from './PlaydateBadge';

interface FamilyResultCardProps {
  entry: DirectoryEntry;
}

/**
 * The family name is the card's one link, stretched over the whole card, so
 * its accessible name is just "The <name> family"; location and the playdate
 * badge are its description instead of being read out with the bio at every
 * Tab stop.
 */
export function FamilyResultCard({ entry: { family, slot } }: FamilyResultCardProps) {
  const id = useId();
  const location = [family.city, family.state].filter(Boolean).join(', ');
  const locationId = `${id}location`;
  const badgeId = `${id}badge`;
  const describedBy = [location ? locationId : '', slot ? badgeId : ''].filter(Boolean).join(' ');

  return (
    <div className="relative rounded-lg bg-surface-card p-4 shadow-lift hover:bg-surface-warm">
      <div className="flex items-start gap-3">
        <Avatar avatarUrl={family.avatarUrl} name={familyInitial(family.name)} size="sm" className="text-ink-lead" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 break-words font-semibold">
              <Link
                to={`/family/${family.id}`}
                aria-describedby={describedBy || undefined}
                className="outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-brand-primary"
              >
                The {family.name} family
              </Link>
            </p>
            {slot && <PlaydateBadge label="Playdate" accessibleLabel="Open playdate slot" accessibleId={badgeId} />}
          </div>
          {location && (
            <p id={locationId} className="text-xs text-ink-muted">
              {location}
            </p>
          )}
          {family.bio && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{family.bio}</p>}
        </div>
      </div>
    </div>
  );
}
