import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { register as registerApi, RegisterPayload } from '@/api/auth';
import { ApiError } from '@/api/client';
import { cn } from '@/utils/cn';

interface Props {
  onSuccess: (email: string) => void;
}

export function RegisterForm({ onSuccess }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterPayload>({
    resolver: zodResolver(RegisterPayload),
    defaultValues: { email: '', password: '', name: '', city: '', state: '' },
  });

  const mutation = useMutation({
    mutationFn: registerApi,
    onSuccess: (_, vars) => onSuccess(vars.email),
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setServerError(err.status === 409 ? 'That email is already registered.' : err.message);
      } else {
        setServerError('Something went wrong. Try again?');
      }
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => { setServerError(null); mutation.mutate(data); })}
      className="space-y-4"
      noValidate
    >
      <Field label="Your name" htmlFor="name" error={errors.name?.message}>
        <input id="name" autoComplete="name" {...register('name')} className={inputCls} />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <input id="email" type="email" autoComplete="email" {...register('email')} className={inputCls} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <input id="password" type="password" autoComplete="new-password" {...register('password')} className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" htmlFor="city" error={errors.city?.message}>
          <input id="city" autoComplete="address-level2" {...register('city')} className={inputCls} />
        </Field>
        <Field label="State" htmlFor="state" error={errors.state?.message}>
          <input id="state" autoComplete="address-level1" {...register('state')} className={inputCls} />
        </Field>
      </div>

      {serverError && (
        <p role="alert" className="text-feedback-error text-sm">{serverError}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || mutation.isPending}
        className={cn(
          'w-full rounded-full bg-brand-primary-pressed px-5 py-3 font-semibold text-white shadow-lift',
          'disabled:opacity-60 disabled:cursor-not-allowed',
        )}
      >
        {isSubmitting || mutation.isPending ? 'Creating your account…' : 'Create my account'}
      </button>
    </form>
  );
}

const inputCls = 'w-full rounded bg-surface-card px-3 py-2 outline-none border border-ink-muted/20 focus:border-brand-primary';

function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium">{label}</label>
      {children}
      {error && <p className="text-feedback-error text-xs">{error}</p>}
    </div>
  );
}
