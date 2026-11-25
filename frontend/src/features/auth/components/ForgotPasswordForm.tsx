import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ForgotPasswordPayload, requestPasswordReset } from '@/api/auth';
import { cn } from '@/utils/cn';

const inputCls = 'w-full rounded bg-surface-card px-3 py-2 outline-none border border-ink-muted/20 focus:border-brand-primary';
const linkCls = 'font-semibold text-brand-primary-pressed underline-offset-4 hover:underline';

export function ForgotPasswordForm() {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<ForgotPasswordPayload>({
    resolver: zodResolver(ForgotPasswordPayload),
    defaultValues: { email: '' },
  });

  const mutation = useMutation({
    mutationFn: (data: ForgotPasswordPayload) => requestPasswordReset(data.email),
    onSuccess: ({ message }) => setConfirmation(message),
    onError: () => setServerError("We couldn't send that link right now. Try again in a moment?"),
  });

  if (confirmation) {
    return (
      <div className="space-y-4">
        <p role="status" className="text-ink-lead">{confirmation}</p>
        <Link to="/login" className={cn('block', linkCls)}>Back to sign in</Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((data) => { setServerError(null); mutation.mutate(data); })}
      className="space-y-4"
      noValidate
    >
      <p className="text-ink-lead">Enter your email and we&apos;ll send you a link to choose a new one.</p>
      <div className="space-y-1">
        <label htmlFor="forgot-email" className="block text-sm font-medium">Email</label>
        <input id="forgot-email" type="email" autoComplete="email" {...register('email')} className={inputCls} />
        {errors.email && <p className="text-feedback-error text-xs">{errors.email.message}</p>}
      </div>

      {serverError && <p role="alert" className="text-feedback-error text-sm">{serverError}</p>}

      <button
        type="submit"
        disabled={mutation.isPending}
        className={cn(
          'w-full rounded-full bg-brand-primary-pressed px-5 py-3 font-semibold text-white shadow-lift',
          'disabled:opacity-60 disabled:cursor-not-allowed',
        )}
      >
        {mutation.isPending ? 'Sending…' : 'Send reset link'}
      </button>
      <p className="text-sm"><Link to="/login" className={linkCls}>Back to sign in</Link></p>
    </form>
  );
}
