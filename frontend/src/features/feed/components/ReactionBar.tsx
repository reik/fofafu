import type { SVGProps } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toggleReaction, REACTION_TYPES, feedKeys, type AnnouncementDTO, type ReactionType, type ReactionResponse } from '@/api/announcements';
import { CelebrateIcon, HeartIcon, HugIcon, SupportIcon, ThumbsUpIcon } from '@/components/icons';
import { cn } from '@/utils/cn';

const REACTION_META: Record<ReactionType, { label: string; Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element; activeClass: string }> = {
  like: { label: 'Like', Icon: ThumbsUpIcon, activeClass: 'border-brand-primary bg-brand-primary/10 text-brand-primary' },
  love: { label: 'Love', Icon: HeartIcon, activeClass: 'border-feedback-error bg-feedback-error/10 text-feedback-error' },
  hug: { label: 'Hug', Icon: HugIcon, activeClass: 'border-brand-warm bg-brand-warm/15 text-ink-lead' },
  celebrate: { label: 'Celebrate', Icon: CelebrateIcon, activeClass: 'border-brand-warm bg-brand-warm/15 text-ink-lead' },
  support: { label: 'Support', Icon: SupportIcon, activeClass: 'border-feedback-success bg-feedback-success/10 text-feedback-success' },
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
        const { Icon, label, activeClass } = REACTION_META[type];
        return (
          <button
            key={type}
            type="button"
            onClick={() => mutation.mutate(type)}
            disabled={mutation.isPending}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
              active
                ? activeClass
                : 'border-ink-muted/20 text-ink-lead hover:bg-surface-warm',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
            {count > 0 && <span className="font-semibold">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
