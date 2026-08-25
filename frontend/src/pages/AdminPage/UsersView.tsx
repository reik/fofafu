import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listUsers, updateUser, setUserBan, forcePasswordReset, adminKeys, type AdminUserDTO } from '@/api/admin';

const EditSchema = z.object({
  name: z.string().min(1, 'Required.'),
  bio: z.string(),
  kidCount: z.string(),
  avatarUrl: z.string(),
  email: z.string().email('Must be a valid email.'),
});
type EditValues = z.infer<typeof EditSchema>;

export function UsersView() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data, isPending, isError } = useQuery({ queryKey: adminKeys.users, queryFn: listUsers });

  const banMutation = useMutation({
    mutationFn: ({ id, unban }: { id: string; unban: boolean }) => setUserBan(id, { unban }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.users }),
  });
  const resetMutation = useMutation({
    mutationFn: (id: string) => forcePasswordReset(id),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateUser>[1] }) => updateUser(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users });
      setEditingId(null);
    },
  });

  if (isPending) return <p className="text-ink-muted">Loading users…</p>;
  if (isError) return <p className="text-feedback-error text-sm">Could not load users.</p>;

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-ink-muted/20 text-ink-muted">
          <th className="py-2 pr-4 font-semibold">Name</th>
          <th className="py-2 pr-4 font-semibold">Email</th>
          <th className="py-2 pr-4 font-semibold">Kids</th>
          <th className="py-2 pr-4 font-semibold">Status</th>
          <th className="py-2 font-semibold">Actions</th>
        </tr>
      </thead>
      <tbody>
        {data?.map((u) => (
          <UserRows
            key={u.id}
            user={u}
            editing={editingId === u.id}
            onEdit={() => setEditingId(u.id)}
            onCancelEdit={() => setEditingId(null)}
            onSave={(input) => updateMutation.mutate({ id: u.id, input })}
            onBan={() => banMutation.mutate({ id: u.id, unban: u.banned })}
            onResetPassword={() => resetMutation.mutate(u.id)}
          />
        ))}
      </tbody>
    </table>
  );
}

function UserRows({
  user,
  editing,
  onEdit,
  onCancelEdit,
  onSave,
  onBan,
  onResetPassword,
}: {
  user: AdminUserDTO;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (input: Parameters<typeof updateUser>[1]) => void;
  onBan: () => void;
  onResetPassword: () => void;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<EditValues>({
    resolver: zodResolver(EditSchema),
    defaultValues: {
      name: user.name,
      bio: user.bio,
      kidCount: user.kidCount?.toString() ?? '',
      avatarUrl: user.avatarUrl ?? '',
      email: user.email ?? '',
    },
  });

  return (
    <>
      <tr className="border-b border-ink-muted/10">
        <td className="py-2 pr-4">{user.name}</td>
        <td className="py-2 pr-4">{user.email ?? '—'}</td>
        <td className="py-2 pr-4">{user.kidCount ?? '—'}</td>
        <td className="py-2 pr-4">{user.banned ? 'Banned' : 'Active'}</td>
        <td className="py-2">
          <button
            type="button"
            onClick={editing ? onCancelEdit : onEdit}
            className="mr-3 rounded-full border border-ink-muted/30 px-3 py-1 text-xs font-semibold hover:bg-surface-warm"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button
            type="button"
            onClick={onBan}
            className="mr-3 rounded-full border border-ink-muted/30 px-3 py-1 text-xs font-semibold hover:bg-surface-warm"
          >
            {user.banned ? 'Unban' : 'Ban'}
          </button>
          <button
            type="button"
            onClick={onResetPassword}
            className="rounded-full border border-ink-muted/30 px-3 py-1 text-xs font-semibold hover:bg-surface-warm"
          >
            Force password reset
          </button>
        </td>
      </tr>
      {editing && (
        <tr className="border-b border-ink-muted/10 bg-surface-warm">
          <td colSpan={5} className="p-3">
            <form
              noValidate
              className="grid grid-cols-2 gap-3 md:grid-cols-5"
              onSubmit={handleSubmit((v) =>
                onSave({
                  name: v.name,
                  bio: v.bio,
                  kidCount: v.kidCount === '' ? null : Number(v.kidCount),
                  avatarUrl: v.avatarUrl === '' ? null : v.avatarUrl,
                  email: v.email,
                }),
              )}
            >
              <label className="text-xs font-semibold text-ink-muted">
                Name
                <input {...register('name')} className="mt-1 block w-full rounded border border-ink-muted/30 p-2 text-sm" />
                {errors.name && <p className="mt-1 text-feedback-error text-xs">{errors.name.message}</p>}
              </label>
              <label className="text-xs font-semibold text-ink-muted">
                Email
                <input {...register('email')} className="mt-1 block w-full rounded border border-ink-muted/30 p-2 text-sm" />
                {errors.email && <p className="mt-1 text-feedback-error text-xs">{errors.email.message}</p>}
              </label>
              <label className="text-xs font-semibold text-ink-muted">
                Kids
                <input {...register('kidCount')} className="mt-1 block w-full rounded border border-ink-muted/30 p-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-ink-muted">
                Avatar URL
                <input {...register('avatarUrl')} className="mt-1 block w-full rounded border border-ink-muted/30 p-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-ink-muted">
                Bio
                <input {...register('bio')} className="mt-1 block w-full rounded border border-ink-muted/30 p-2 text-sm" />
              </label>
              <button
                type="submit"
                className="col-span-2 rounded-full bg-brand-primary-pressed px-4 py-2 text-xs font-semibold text-white md:col-span-1"
              >
                Save
              </button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
