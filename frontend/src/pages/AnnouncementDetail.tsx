import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAnnouncement, listComments, feedKeys } from '@/api/announcements';
import { Layout } from '@/components/Layout';
import { ReactionBar } from '@/features/feed/components/ReactionBar';
import { CommentList } from '@/features/feed/components/CommentList';
import { CommentForm } from '@/features/feed/components/CommentForm';

export default function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>();

  const postQuery = useQuery({
    queryKey: feedKeys.byId(id ?? ''),
    queryFn: () => getAnnouncement(id!),
    enabled: !!id,
  });

  const commentsQuery = useQuery({
    queryKey: feedKeys.comments(id ?? ''),
    queryFn: () => listComments(id!),
    enabled: !!id,
  });

  if (!id) {
    return <Layout><h1 className="text-3xl font-semibold">Missing post</h1></Layout>;
  }

  if (postQuery.isPending) {
    return <Layout><p className="text-ink-muted">Loading…</p></Layout>;
  }
  if (postQuery.isError || !postQuery.data) {
    return (
      <Layout>
        <h1 className="text-3xl font-semibold tracking-tight">We couldn’t find that post</h1>
        <p className="mt-2 text-sm text-ink-muted">{postQuery.error instanceof Error ? postQuery.error.message : ''}</p>
        <p className="mt-6 text-sm">
          <Link to="/feed" className="text-brand-primary underline-offset-4 hover:underline">Back to feed</Link>
        </p>
      </Layout>
    );
  }

  const post = postQuery.data;

  return (
    <Layout>
      <article className="space-y-3 rounded-lg bg-surface-card p-5 shadow-lift">
        <time className="font-mono uppercase tracking-wide text-xs text-ink-muted">
          {new Date(post.createdAt).toLocaleString()}
        </time>
        <p className="whitespace-pre-line text-ink-lead">{post.content}</p>
        <ReactionBar announcement={post} />
      </article>

      <section className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold">Comments</h2>
        {commentsQuery.isPending && <p className="text-ink-muted text-sm">Loading comments…</p>}
        {commentsQuery.data && <CommentList comments={commentsQuery.data} />}
        <CommentForm announcementId={post.id} />
      </section>

      <p className="mt-8 text-sm">
        <Link to="/feed" className="text-brand-primary underline-offset-4 hover:underline">Back to feed</Link>
      </p>
    </Layout>
  );
}
