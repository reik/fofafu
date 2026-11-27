import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listThreads, messageKeys } from '@/api/messages';
import { Layout } from '@/components/Layout';
import { AboutFamilyCard } from '@/features/messages/components/AboutFamilyCard';
import { ConversationList } from '@/features/messages/components/ConversationList';
import { ConversationPane } from '@/features/messages/components/ConversationPane';
import { SuggestedFamiliesCard } from '@/features/messages/components/SuggestedFamiliesCard';
import { MEDIA_LG, MEDIA_MD, useMediaQuery } from '@/hooks/useMediaQuery';

// Search's grid, with the right column added only at lg so the conversation
// keeps a usable width at md. The arbitrary variant gives every focusable
// element a scroll margin, so focus never lands under the sticky navbar.
const GRID =
  'grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)_240px] [&_:is(a,button,input,textarea)]:scroll-my-20';

/**
 * Both /messages and /messages/:userId. At md and wider it is one page (the
 * list, the open conversation and, at lg, the family rail), so choosing a
 * conversation never remounts the list. Below md it is today's two pages: the
 * list, or the conversation with a link back.
 */
export default function MessagesPage() {
  const { userId } = useParams<{ userId: string }>();
  const isDesktop = useMediaQuery(MEDIA_MD);
  const isWide = useMediaQuery(MEDIA_LG);
  const threads = useQuery({ queryKey: messageKeys.threads, queryFn: listThreads });

  if (!isDesktop) {
    return (
      <Layout>
        {userId ? (
          <>
            <h1 className="sr-only">Messages</h1>
            <ConversationPane partnerId={userId} threads={threads} isDesktop={false} />
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-tight">Messages</h1>
            <p className="mt-2 mb-6 text-sm text-ink-muted">Your private conversations with other foster families.</p>
            <ConversationList threads={threads} fillHeight={false} />
            <p className="mt-8 text-sm">
              <Link to="/" className="text-brand-primary-pressed underline-offset-4 hover:underline">Back home</Link>
            </p>
          </>
        )}
      </Layout>
    );
  }

  const partner = threads.data?.find((t) => t.partnerId === userId);
  return (
    <Layout wide>
      <h1 className="sr-only">Messages</h1>
      <div className={GRID}>
        <ConversationList threads={threads} selectedId={userId} fillHeight />
        <ConversationPane partnerId={userId} threads={threads} isDesktop />
        {isWide && (
          <div className="space-y-4">
            {userId && <AboutFamilyCard key={userId} partnerId={userId} partnerName={partner?.partnerName} />}
            <SuggestedFamiliesCard />
          </div>
        )}
      </div>
    </Layout>
  );
}
