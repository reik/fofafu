import { useAuthStore } from '@/stores/auth';

const BASE = '/api';

export interface ApiErrorShape {
  status: number;
  error: string;
  fields: Record<string, string[]> | undefined;
}

export class ApiError extends Error {
  status: number;
  fields: Record<string, string[]> | undefined;
  constructor(payload: ApiErrorShape) {
    super(payload.error);
    this.status = payload.status;
    this.fields = payload.fields;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.headers ?? {}),
  };
  if (token) headers['authorization'] = `Bearer ${token}`;

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  const res = await fetch(`${BASE}${path}`, init);

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new ApiError({
      status: res.status,
      error: (data as { error?: string }).error ?? `HTTP ${res.status}`,
      fields: (data as { fields?: Record<string, string[]> }).fields,
    });
  }
  return data as T;
}
