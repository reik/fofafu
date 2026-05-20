import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteComment, feedKeys, type CommentDTO } from '@/api/announcements';
import { formatAuthor } from '@/utils/formatAuthor';

interface Props {
  comments: CommentDTO[];
}

export function CommentList({ comments }: Props) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: deleteComment,
    onSuccess: (_data, commentId) => {
      const targeted = comments.find((c) => c.id === commentId);
      if (targeted) {
        qc.invalidateQueries({ queryKey: feedKeys.comments(targeted.announcementId) });
      }
    },
  });

  if (comments.length === 0) {
    return <p className="text-sm italic text-ink-muted">Be the first to say something.</p>;
  }
  return (
    <ul className="space-y-3">
      {comments.map((c) => (
        <li key={c.id} className="rounded bg-surface-card p-3 shadow-lift">
          <header className="mb-1 flex items-center justify-between text-xs text-ink-muted">
            <div className="flex items-baseline gap-2">
              {c.authorName
                ? (
                  <Link
                    to={`/family/${c.authorId}`}
                    className="text-sm font-semibold text-ink-lead underline-offset-4 hover:underline"
                  >
                    {formatAuthor(c.authorName)}
                  </Link>
                )
                : (
                  <span className="text-sm font-semibold italic">
                    {formatAuthor(c.authorName)}
                  </span>
                )}
              <time className="font-mono uppercase tracking-wide">
                {new Date(c.createdAt).toLocaleString()}
              </time>
            </div>
            {c.isAuthor && (
              <button
                type="button"
                onClick={() => { if (window.confirm('Delete this comment?')) del.mutate(c.id); }}
                disabled={del.isPending}
                className="text-feedback-error underline-offset-4 hover:underline disabled:opacity-60"
              >
                Delete
              </button>
            )}
          </header>
          <p className="whitespace-pre-line text-ink-lead">{c.content}</p>
        </li>
      ))}
    </ul>
  );
}
