import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { login as loginApi, LoginPayload } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/utils/cn';

export function LoginForm() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginPayload>({
    resolver: zodResolver(LoginPayload),
    defaultValues: { email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: loginApi,
    onSuccess: (res) => {
      setAuth({ token: res.token, user: res.user });
      navigate('/');
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setServerError(
          err.status === 403 ? 'Verify your email first — check your inbox.'
          : err.status === 401 ? 'Wrong email or password.'
          : err.message,
        );
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
      <div className="space-y-1">
        <label htmlFor="login-email" className="block text-sm font-medium">Email</label>
        <input id="login-email" type="email" autoComplete="email" {...register('email')} className={inputCls} />
        {errors.email && <p className="text-feedback-error text-xs">{errors.email.message}</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor="login-password" className="block text-sm font-medium">Password</label>
        <input id="login-password" type="password" autoComplete="current-password" {...register('password')} className={inputCls} />
        {errors.password && <p className="text-feedback-error text-xs">{errors.password.message}</p>}
      </div>

      {serverError && <p role="alert" className="text-feedback-error text-sm">{serverError}</p>}

      <button
        type="submit"
        disabled={isSubmitting || mutation.isPending}
        className={cn(
          'w-full rounded-full bg-brand-primary-pressed px-5 py-3 font-semibold text-white shadow-lift',
          'disabled:opacity-60 disabled:cursor-not-allowed',
        )}
      >
        {isSubmitting || mutation.isPending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

const inputCls = 'w-full rounded bg-surface-card px-3 py-2 outline-none border border-ink-muted/20 focus:border-brand-primary';
