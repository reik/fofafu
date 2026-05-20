import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteAnnouncement, feedKeys, type AnnouncementDTO } from '@/api/announcements';
import { formatAuthor } from '@/utils/formatAuthor';
import { ReactionBar } from './ReactionBar';
import { AnnouncementEditForm } from './AnnouncementEditForm';

interface Props {
  announcement: AnnouncementDTO;
}

export function AnnouncementCard({ announcement }: Props) {
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => deleteAnnouncement(announcement.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: feedKeys.page });
    },
  });

  return (
    <article className="space-y-3 rounded-lg bg-surface-card p-5 shadow-lift">
      <header className="flex items-center justify-between text-xs">
        <div className="flex items-baseline gap-2">
          {announcement.authorName
            ? (
              <Link
                to={`/family/${announcement.authorId}`}
                className="text-sm font-semibold text-ink-lead underline-offset-4 hover:underline"
              >
                {formatAuthor(announcement.authorName)}
              </Link>
            )
            : (
              <span className="text-sm font-semibold text-ink-muted italic">
                {formatAuthor(announcement.authorName)}
              </span>
            )}
          <time className="font-mono uppercase tracking-wide text-ink-muted">
            {new Date(announcement.createdAt).toLocaleString()}
          </time>
        </div>
        <div className="flex items-center gap-3">
          {announcement.isAuthor && !editing && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-ink-muted underline-offset-4 hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Delete this post?')) del.mutate();
                }}
                disabled={del.isPending}
                className="text-feedback-error underline-offset-4 hover:underline disabled:opacity-60"
              >
                {del.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </>
          )}
          <Link
            to={`/post/${announcement.id}`}
            className="text-brand-primary underline-offset-4 hover:underline"
          >
            Open
          </Link>
        </div>
      </header>

      {editing ? (
        <AnnouncementEditForm announcement={announcement} onDone={() => setEditing(false)} />
      ) : (
        <>
          <p className="whitespace-pre-line text-ink-lead">{announcement.content}</p>
          {announcement.mediaUrl && announcement.mediaType === 'image' && (
            <img
              src={announcement.mediaUrl}
              alt=""
              className="max-h-96 w-full rounded object-cover"
            />
          )}
          <ReactionBar announcement={announcement} />
        </>
      )}
    </article>
  );
}
