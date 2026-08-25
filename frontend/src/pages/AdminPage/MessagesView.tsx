import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getConversation, updateMessage, deleteMessage, adminKeys } from '@/api/admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LookupSchema = z.object({
  userIdA: z.string().regex(UUID_RE, 'Must be a UUID.'),
  userIdB: z.string().regex(UUID_RE, 'Must be a UUID.'),
});
type LookupValues = z.infer<typeof LookupSchema>;

const ContentSchema = z.object({ content: z.string().min(1, 'Cannot be empty.') });
type ContentValues = z.infer<typeof ContentSchema>;

export function MessagesView() {
  const [loaded, setLoaded] = useState<{ a: string; b: string } | null>(null);
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<LookupValues>({
    resolver: zodResolver(LookupSchema),
    defaultValues: { userIdA: '', userIdB: '' },
  });

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
        noValidate
        className="flex flex-wrap items-start gap-2"
        onSubmit={handleSubmit((v) => setLoaded({ a: v.userIdA, b: v.userIdB }))}
      >
        <label className="text-xs font-semibold text-ink-muted">
          User A id
          <input {...register('userIdA')} className="mt-1 block rounded border border-ink-muted/30 p-2 text-sm" />
          {errors.userIdA && <p className="mt-1 text-feedback-error text-xs">{errors.userIdA.message}</p>}
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          User B id
          <input {...register('userIdB')} className="mt-1 block rounded border border-ink-muted/30 p-2 text-sm" />
          {errors.userIdB && <p className="mt-1 text-feedback-error text-xs">{errors.userIdB.message}</p>}
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
  const [editing, setEditing] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<ContentValues>({
    resolver: zodResolver(ContentSchema),
    defaultValues: { content },
  });

  return (
    <li className="rounded-lg bg-surface-card p-3 shadow-lift">
      {editing ? (
        <form
          noValidate
          onSubmit={handleSubmit((data) => {
            onSave(data.content);
            setEditing(false);
          })}
        >
          <div className="flex items-start gap-2">
            <textarea {...register('content')} className="w-full rounded border border-ink-muted/30 p-2 text-sm" />
            <button type="submit" className="rounded-full bg-brand-primary-pressed px-3 py-1 text-xs font-semibold text-white">
              Save
            </button>
          </div>
          {errors.content && <p className="mt-1 text-feedback-error text-xs">{errors.content.message}</p>}
        </form>
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
