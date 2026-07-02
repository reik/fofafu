import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/utils/cn';
import { respondToRequest } from '@/api/playdates';
import { ApiError } from '@/api/client';
import { Avatar } from '@/components/Avatar';
import type { PlaydateRequest } from '@/types/playdates';

interface RequestCardProps {
  request: PlaydateRequest;
  myId: string;
  onUpdate: () => void;
}

// color.request.pending  bg=#FBF1DC fg=#8A5D1F (darkened for AA at badge size)
// color.request.accepted bg=#E3EFE7 fg=#2F6B41
// color.request.declined bg=#F6E2E2 fg=#8C2E2E
const STATUS_BADGE_CLASSES = {
  pending: 'bg-[#FBF1DC] text-[#8A5D1F]',
  accepted: 'bg-[#E3EFE7] text-[#2F6B41]',
  declined: 'bg-[#F6E2E2] text-[#8C2E2E]',
} satisfies Record<PlaydateRequest['status'], string>;

export function RequestCard({ request, myId, onUpdate }: RequestCardProps) {
  const isOwner = request.ownerFamilyId === myId;
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const respond = async (status: 'accepted' | 'declined') => {
    setResponding(true);
    setError(null);
    try {
      await respondToRequest(request.id, status);
      onUpdate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to respond');
      setResponding(false);
    }
  };

  const otherName = isOwner ? request.requesterName : request.ownerName;
  const dateStr = format(new Date(request.slotDate), 'EEE, MMM d');

  return (
    <div className="flex items-start gap-3 p-3 rounded bg-surface-card shadow-lift border border-[#EDE3D4]">
      <Avatar avatarUrl={undefined} name={otherName ?? ''} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-[0.9rem] text-ink-lead">{otherName ?? '—'}</span>
          <span
            className={cn(
              'text-[0.72rem] font-bold px-2 py-[2px] rounded-full',
              STATUS_BADGE_CLASSES[request.status],
            )}
          >
            {request.status}
          </span>
        </div>
        <div className="text-ink-muted text-[0.8rem] mt-[2px]">
          {isOwner ? 'Requested' : 'You requested'} · {dateStr} · {request.slotStartTime}–{request.slotEndTime}
        </div>
        {request.message && (
          <div className="text-[0.82rem] mt-1 italic text-ink-muted">"{request.message}"</div>
        )}
        <div className="text-[0.72rem] text-ink-muted mt-[2px]">
          {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
        </div>
        {error && <p role="alert" className="text-feedback-error text-xs mt-1">{error}</p>}
        {isOwner && request.status === 'pending' && (
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              disabled={responding}
              onClick={() => respond('accepted')}
              className="rounded-full bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white shadow-lift hover:bg-brand-primary/90 disabled:opacity-60 transition-colors"
            >
              {responding ? '…' : 'Accept'}
            </button>
            <button
              type="button"
              disabled={responding}
              onClick={() => respond('declined')}
              className="rounded-full border border-feedback-error px-3 py-1.5 text-xs font-semibold text-feedback-error hover:bg-feedback-error/10 disabled:opacity-60 transition-colors"
            >
              {responding ? '…' : 'Decline'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
