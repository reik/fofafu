import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteComment, feedKeys, type CommentDTO } from '@/api/announcements';
import { EditIcon, TrashIcon } from '@/components/icons';
import { formatAuthor } from '@/utils/formatAuthor';
import { formatTimestamp } from '@/utils/formatTimestamp';
import { BlockedContentPlaceholder } from '@/features/moderation/components/BlockedContentPlaceholder';
import { ModerationMenu } from '@/features/moderation/components/ModerationMenu';
import { CommentEditForm } from './CommentEditForm';

interface Props {
  comments: CommentDTO[];
}

export function CommentList({ comments }: Props) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, CommentDTO>>({});
  // authorId -> resolved canonical families.id, once that author's been
  // blocked from one of their own comments in this list. Keyed by author
  // (not comment id) so every comment by that family swaps at once, not
  // just the row the Block action was fired from.
  const [blockedFamilies, setBlockedFamilies] = useState<Record<string, string>>({});
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
      {comments.map((raw) => {
        const c = edits[raw.id] ?? raw;
        const resolvedBlockedFamilyId = blockedFamilies[c.authorId];
        if (resolvedBlockedFamilyId) {
          return (
            <li key={c.id}>
              <BlockedContentPlaceholder familyId={resolvedBlockedFamilyId} familyName={formatAuthor(c.authorName)} />
            </li>
          );
        }
        const isEdited = c.updatedAt > c.createdAt;
        const isEditing = editingId === c.id;
        return (
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
                <time className="text-[10px] font-mono tracking-wide">
                  {formatTimestamp(c.createdAt)}
                </time>
                {isEdited && (
                  <span className="italic" aria-label="This comment was edited">(edited)</span>
                )}
              </div>
              {c.isAuthor && !isEditing && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingId(c.id)}
                    className="inline-flex items-center gap-1 text-ink-muted underline-offset-4 hover:underline"
                  >
                    <EditIcon className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (window.confirm('Delete this comment?')) del.mutate(c.id); }}
                    disabled={del.isPending}
                    className="inline-flex items-center gap-1 text-feedback-error underline-offset-4 hover:underline disabled:opacity-60"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              )}
              {!c.isAuthor && !isEditing && (
                <ModerationMenu
                  targetType="comment"
                  targetId={c.id}
                  authorId={c.authorId}
                  authorName={c.authorName}
                  onBlocked={(resolvedFamilyId) =>
                    setBlockedFamilies((prev) => ({ ...prev, [c.authorId]: resolvedFamilyId }))}
                />
              )}
            </header>
            {isEditing
              ? (
                <CommentEditForm
                  comment={c}
                  onDone={(updated) => {
                    if (updated) setEdits((prev) => ({ ...prev, [updated.id]: updated }));
                    setEditingId(null);
                  }}
                />
              )
              : <p className="whitespace-pre-line text-ink-lead">{c.content}</p>}
          </li>
        );
      })}
    </ul>
  );
}
