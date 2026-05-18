import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteComment, feedKeys, type CommentDTO } from '@/api/announcements';

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
          <header className="mb-1 flex items-center justify-between text-xs font-mono uppercase tracking-wide text-ink-muted">
            <time>{new Date(c.createdAt).toLocaleString()}</time>
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
