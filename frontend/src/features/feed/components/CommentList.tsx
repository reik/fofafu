import type { CommentDTO } from '@/api/announcements';

interface Props {
  comments: CommentDTO[];
}

export function CommentList({ comments }: Props) {
  if (comments.length === 0) {
    return <p className="text-sm italic text-ink-muted">Be the first to say something.</p>;
  }
  return (
    <ul className="space-y-3">
      {comments.map((c) => (
        <li key={c.id} className="rounded bg-surface-card p-3 shadow-lift">
          <header className="mb-1 text-xs font-mono uppercase tracking-wide text-ink-muted">
            {new Date(c.createdAt).toLocaleString()}
          </header>
          <p className="whitespace-pre-line text-ink-lead">{c.content}</p>
        </li>
      ))}
    </ul>
  );
}
