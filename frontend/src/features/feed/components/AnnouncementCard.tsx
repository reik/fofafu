import { Link } from 'react-router-dom';
import type { AnnouncementDTO } from '@/api/announcements';
import { ReactionBar } from './ReactionBar';

interface Props {
  announcement: AnnouncementDTO;
}

export function AnnouncementCard({ announcement }: Props) {
  return (
    <article className="space-y-3 rounded-lg bg-surface-card p-5 shadow-lift">
      <header className="flex items-center justify-between text-xs">
        <time className="font-mono uppercase tracking-wide text-ink-muted">
          {new Date(announcement.createdAt).toLocaleString()}
        </time>
        <Link
          to={`/post/${announcement.id}`}
          className="text-brand-primary underline-offset-4 hover:underline"
        >
          Open
        </Link>
      </header>
      <p className="whitespace-pre-line text-ink-lead">{announcement.content}</p>
      {announcement.mediaUrl && announcement.mediaType === 'image' && (
        <img
          src={announcement.mediaUrl}
          alt=""
          className="max-h-96 w-full rounded object-cover"
        />
      )}
      <ReactionBar announcement={announcement} />
    </article>
  );
}
