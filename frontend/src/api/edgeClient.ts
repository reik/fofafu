import { FUNCTIONS_URL, supabase } from '@/lib/supabaseClient';

/**
 * Fetch wrapper for Supabase Edge Functions (announcement, family, community,
 * search — see supabase/functions/). Forwards the caller's Supabase access
 * token so RLS evaluates as the real user (mirrors
 * supabase/functions/_shared/client.ts's expectation), unlike `apiRequest` in
 * `./client.ts` which still talks to the old Express backend for
 * messages/playdates/uploads.
 */

export interface EdgeErrorShape {
  status: number;
  error: string;
}

export class EdgeApiError extends Error {
  status: number;
  constructor(payload: EdgeErrorShape) {
    super(payload.error);
    this.status = payload.status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

export async function edgeRequest<T>(fn: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;

  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);

  const res = await fetch(`${FUNCTIONS_URL}/${fn}${path}`, init);

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new EdgeApiError({
      status: res.status,
      error: (parsed as { error?: string }).error ?? `HTTP ${res.status}`,
    });
  }
  return parsed as T;
}
