import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toggleReaction, REACTION_TYPES, feedKeys, type AnnouncementDTO, type ReactionType, type ReactionResponse } from '@/api/announcements';
import { cn } from '@/utils/cn';

const LABEL: Record<ReactionType, string> = {
  like: '👍 like',
  love: '❤️ love',
  hug: '🤗 hug',
  celebrate: '🎉 celebrate',
  support: '🫶 support',
};

interface Props {
  announcement: AnnouncementDTO;
}

export function ReactionBar({ announcement }: Props) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (type: ReactionType) => toggleReaction(announcement.id, type),
    onSuccess: (res: ReactionResponse) => {
      qc.setQueryData<AnnouncementDTO>(feedKeys.byId(announcement.id), (prev) =>
        prev ? { ...prev, reactions: res.reactions, myReaction: res.myReaction } : prev,
      );
      qc.invalidateQueries({ queryKey: feedKeys.page });
    },
  });

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Reactions">
      {REACTION_TYPES.map((type) => {
        const active = announcement.myReaction === type;
        const count = announcement.reactions[type];
        return (
          <button
            key={type}
            type="button"
            onClick={() => mutation.mutate(type)}
            disabled={mutation.isPending}
            aria-pressed={active}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition',
              active
                ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                : 'border-ink-muted/20 text-ink-lead hover:bg-surface-warm',
            )}
          >
            {LABEL[type]} {count > 0 && <span className="ml-1 font-semibold">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
