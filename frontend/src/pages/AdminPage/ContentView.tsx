import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listContent, updateContent, deleteContent, adminKeys, type ContentTable } from '@/api/admin';
import { cn } from '@/utils/cn';

const ContentSchema = z.object({ content: z.string().min(1, 'Cannot be empty.') });
type ContentValues = z.infer<typeof ContentSchema>;

const TABLES: { id: ContentTable; label: string; editable: boolean }[] = [
  { id: 'announcements', label: 'Announcements', editable: true },
  { id: 'comments', label: 'Comments', editable: true },
  { id: 'reactions', label: 'Reactions', editable: false },
];

export function ContentView() {
  const [table, setTable] = useState<ContentTable>('announcements');
  const editable = TABLES.find((t) => t.id === table)?.editable ?? false;
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: adminKeys.content(table),
    queryFn: () => listContent(table),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      updateContent(table as 'announcements' | 'comments', id, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.content(table) }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteContent(table, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.content(table) }),
  });

  return (
    <div>
      <div role="tablist" aria-label="Content table" className="flex gap-1">
        {TABLES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={table === t.id}
            onClick={() => setTable(t.id)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              table === t.id ? 'bg-brand-primary-pressed text-white' : 'bg-surface-warm text-ink-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isPending && <p className="mt-4 text-ink-muted">Loading…</p>}
      {isError && <p className="mt-4 text-feedback-error text-sm">Could not load {table}.</p>}

      <ul className="mt-4 space-y-2">
        {data?.map((row) => (
          <li key={row.id} className="rounded-lg bg-surface-card p-3 shadow-lift">
            {'content' in row ? (
              editable ? (
                <EditableContent
                  content={row.content}
                  onSave={(content) => updateMutation.mutate({ id: row.id, content })}
                />
              ) : (
                <p className="text-sm">{row.content}</p>
              )
            ) : (
              <p className="text-sm">{row.type}</p>
            )}
            <button
              type="button"
              onClick={() => deleteMutation.mutate(row.id)}
              className="mt-2 text-xs font-semibold text-feedback-error hover:underline"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditableContent({ content, onSave }: { content: string; onSave: (content: string) => void }) {
  const [editing, setEditing] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<ContentValues>({
    resolver: zodResolver(ContentSchema),
    defaultValues: { content },
  });

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm">{content}</p>
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-brand-primary hover:underline">
          Edit
        </button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit((data) => {
        onSave(data.content);
        setEditing(false);
      })}
    >
      <div className="flex items-start gap-2">
        <textarea
          {...register('content')}
          className="w-full rounded border border-ink-muted/30 p-2 text-sm"
        />
        <button type="submit" className="rounded-full bg-brand-primary-pressed px-3 py-1 text-xs font-semibold text-white">
          Save
        </button>
      </div>
      {errors.content && <p className="mt-1 text-feedback-error text-xs">{errors.content.message}</p>}
    </form>
  );
}
