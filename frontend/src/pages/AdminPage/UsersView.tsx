import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listUsers, setUserBan, forcePasswordReset, adminKeys } from '@/api/admin';

export function UsersView() {
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({ queryKey: adminKeys.users, queryFn: listUsers });

  const banMutation = useMutation({
    mutationFn: ({ id, unban }: { id: string; unban: boolean }) => setUserBan(id, { unban }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.users }),
  });
  const resetMutation = useMutation({
    mutationFn: (id: string) => forcePasswordReset(id),
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
          <tr key={u.id} className="border-b border-ink-muted/10">
            <td className="py-2 pr-4">{u.name}</td>
            <td className="py-2 pr-4">{u.email ?? '—'}</td>
            <td className="py-2 pr-4">{u.kidCount ?? '—'}</td>
            <td className="py-2 pr-4">{u.banned ? 'Banned' : 'Active'}</td>
            <td className="py-2">
              <button
                type="button"
                onClick={() => banMutation.mutate({ id: u.id, unban: u.banned })}
                className="mr-3 rounded-full border border-ink-muted/30 px-3 py-1 text-xs font-semibold hover:bg-surface-warm"
              >
                {u.banned ? 'Unban' : 'Ban'}
              </button>
              <button
                type="button"
                onClick={() => resetMutation.mutate(u.id)}
                className="rounded-full border border-ink-muted/30 px-3 py-1 text-xs font-semibold hover:bg-surface-warm"
              >
                Force password reset
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
