import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server, handlers, FUNCTIONS_BASE, JANE } from '@/tests/msw-server';
import { edgeRequest, EdgeApiError } from './edgeClient';

describe('edgeRequest (Edge Function fetch wrapper)', () => {
  it('hits the Edge Function URL, not the old Express /api/... path', async () => {
    let requestedUrl: string | undefined;
    server.use(
      http.get(`${FUNCTIONS_BASE}/family/me`, ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({ ok: true });
      }),
    );
    await edgeRequest('family', '/me');
    expect(requestedUrl).toBe(`${FUNCTIONS_BASE}/family/me`);
  });

  it('forwards the caller Supabase access token as an Authorization: Bearer header when a session exists', async () => {
    server.use(handlers.loginOk());
    // Establish a session the same way the app does, via supabase-js.
    const { supabase } = await import('@/lib/supabaseClient');
    await supabase.auth.signInWithPassword({ email: JANE.email, password: 'correct-horse-battery' });

    let authHeader: string | null = null;
    server.use(
      http.get(`${FUNCTIONS_BASE}/family/me`, ({ request }) => {
        authHeader = request.headers.get('authorization');
        return HttpResponse.json({ ok: true });
      }),
    );
    await edgeRequest('family', '/me');
    expect(authHeader).toBe('Bearer fake-access-token');
  });

  it('sends no Authorization header when there is no session', async () => {
    let authHeader: string | null = 'not-checked';
    server.use(
      http.get(`${FUNCTIONS_BASE}/family/me`, ({ request }) => {
        authHeader = request.headers.get('authorization');
        return HttpResponse.json({ ok: true });
      }),
    );
    await edgeRequest('family', '/me');
    expect(authHeader).toBeNull();
  });

  it('throws EdgeApiError with the status and message from a non-2xx Edge Function response', async () => {
    server.use(
      http.get(`${FUNCTIONS_BASE}/family/me`, () => HttpResponse.json({ error: 'Not found' }, { status: 404 })),
    );
    await expect(edgeRequest('family', '/me')).rejects.toBeInstanceOf(EdgeApiError);
    await expect(edgeRequest('family', '/me')).rejects.toThrow('Not found');
  });
});
