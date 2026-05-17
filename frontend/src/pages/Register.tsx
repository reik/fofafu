import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { RegisterForm } from '@/features/auth/components/RegisterForm';

export default function RegisterPage() {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  if (submittedEmail) {
    return (
      <Layout>
        <h1 className="text-3xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-3 text-ink-lead">
          We sent a verification link to <strong>{submittedEmail}</strong>. Tap it to finish setting up your family.
        </p>
        <p className="mt-8 text-sm">
          <Link to="/login" className="font-semibold text-brand-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome to fofafu</h1>
      <p className="mt-2 text-ink-lead">A page for foster families. Sign up to get yours.</p>
      <div className="mt-8">
        <RegisterForm onSuccess={setSubmittedEmail} />
      </div>
      <p className="mt-6 text-sm">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </Layout>
  );
}
