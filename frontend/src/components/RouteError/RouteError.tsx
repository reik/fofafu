import { Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';

/**
 * Route-level `errorElement`: shown when a route throws while rendering or
 * loading. Deliberately does not surface the raw error to the user.
 */
export function RouteError() {
  return (
    <Layout>
      <div role="alert">
        <h1 className="text-3xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-ink-lead">
          We hit a snag loading this page. Please try again in a moment.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block font-semibold text-brand-primary-pressed underline"
        >
          Back to home
        </Link>
      </div>
    </Layout>
  );
}
