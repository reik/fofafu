import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getConversation, updateMessage, deleteMessage, adminKeys } from '@/api/admin';

export function MessagesView() {
  const [userIdA, setUserIdA] = useState('');
  const [userIdB, setUserIdB] = useState('');
  const [loaded, setLoaded] = useState<{ a: string; b: string } | null>(null);
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: loaded ? adminKeys.conversation(loaded.a, loaded.b) : ['admin', 'messages', 'none'],
    queryFn: () => getConversation(loaded!.a, loaded!.b),
    enabled: !!loaded,
  });

  const invalidate = () => {
    if (loaded) queryClient.invalidateQueries({ queryKey: adminKeys.conversation(loaded.a, loaded.b) });
  };
  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => updateMessage(id, content),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMessage(id),
    onSuccess: invalidate,
  });

  return (
    <div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (userIdA && userIdB) setLoaded({ a: userIdA, b: userIdB });
        }}
      >
        <label className="text-xs font-semibold text-ink-muted">
          User A id
          <input
            value={userIdA}
            onChange={(e) => setUserIdA(e.target.value)}
            className="mt-1 block rounded border border-ink-muted/30 p-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          User B id
          <input
            value={userIdB}
            onChange={(e) => setUserIdB(e.target.value)}
            className="mt-1 block rounded border border-ink-muted/30 p-2 text-sm"
          />
        </label>
        <button type="submit" className="rounded-full bg-brand-primary-pressed px-4 py-2 text-sm font-semibold text-white">
          Load conversation
        </button>
      </form>

      {loaded && (
        <div className="mt-4">
          <div
            role="alert"
            className="rounded-lg border border-feedback-warning bg-surface-card p-3 text-sm font-semibold text-feedback-warning shadow-lift"
          >
            You are viewing a private conversation between two other users.
          </div>

          {isPending && <p className="mt-4 text-ink-muted">Loading…</p>}
          {isError && <p className="mt-4 text-feedback-error text-sm">Could not load this conversation.</p>}

          <ul className="mt-4 space-y-2">
            {data?.map((m) => (
              <MessageRow
                key={m.id}
                content={m.content}
                onSave={(content) => updateMutation.mutate({ id: m.id, content })}
                onDelete={() => deleteMutation.mutate(m.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MessageRow({
  content,
  onSave,
  onDelete,
}: {
  content: string;
  onSave: (content: string) => void;
  onDelete: () => void;
}) {
  const [value, setValue] = useState(content);
  const [editing, setEditing] = useState(false);

  return (
    <li className="rounded-lg bg-surface-card p-3 shadow-lift">
      {editing ? (
        <div className="flex items-start gap-2">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded border border-ink-muted/30 p-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              onSave(value);
              setEditing(false);
            }}
            className="rounded-full bg-brand-primary-pressed px-3 py-1 text-xs font-semibold text-white"
          >
            Save
          </button>
        </div>
      ) : (
        <p className="text-sm">{content}</p>
      )}
      <div className="mt-2 flex gap-3">
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-brand-primary hover:underline">
            Edit
          </button>
        )}
        <button type="button" onClick={onDelete} className="text-xs font-semibold text-feedback-error hover:underline">
          Delete
        </button>
      </div>
    </li>
  );
}
