import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server, FUNCTIONS_BASE } from '@/tests/msw-server';
import { useCoach, resetCoachSessionCacheForTests } from './useCoach';

const NEUTRAL = { verdict: 'ok' as const, categories: [], reasoning: '', rewrite: null };
const SUGGEST_A = { verdict: 'suggest' as const, categories: ['minimization'], reasoning: 'reasoning A', rewrite: 'rewrite A' };
const SUGGEST_B = { verdict: 'suggest' as const, categories: ['savior-framing'], reasoning: 'reasoning B', rewrite: 'rewrite B' };

const LONG_DRAFT = 'At least you got to keep her for a while.';
const SHORT_DRAFT = 'hi there';

function mockCoach(
  response: Record<string, unknown>,
  opts: { status?: number; delayMs?: number; headers?: Record<string, string> } = {},
) {
  server.use(
    http.post(`${FUNCTIONS_BASE}/coach`, async () => {
      if (opts.delayMs) await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
      return HttpResponse.json(response, {
        status: opts.status ?? 200,
        ...(opts.headers ? { headers: opts.headers } : {}),
      });
    }),
  );
}

describe('useCoach', () => {
  beforeEach(() => {
    resetCoachSessionCacheForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call the API for a draft under 20 characters via the debounce path', async () => {
    let called = false;
    server.use(
      http.post(`${FUNCTIONS_BASE}/coach`, () => {
        called = true;
        return HttpResponse.json(NEUTRAL);
      }),
    );
    renderHook(() => useCoach(SHORT_DRAFT));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(called).toBe(false);
  });

  it('does not call the API when triggerNow is invoked on a short draft', async () => {
    let called = false;
    server.use(
      http.post(`${FUNCTIONS_BASE}/coach`, () => {
        called = true;
        return HttpResponse.json(NEUTRAL);
      }),
    );
    const { result } = renderHook(() => useCoach(SHORT_DRAFT));
    await act(async () => {
      result.current.triggerNow();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(called).toBe(false);
  });

  it('fires ~600ms after the draft stabilizes and surfaces a suggest verdict', async () => {
    mockCoach(SUGGEST_A);
    const { result } = renderHook(() => useCoach(LONG_DRAFT));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(599);
    });
    expect(result.current.suggestion).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(result.current.suggestion).toEqual({ rewrite: 'rewrite A', reasoning: 'reasoning A' });
  });

  it('triggerNow bypasses and cancels the pending debounce so only one call fires', async () => {
    let callCount = 0;
    server.use(
      http.post(`${FUNCTIONS_BASE}/coach`, () => {
        callCount++;
        return HttpResponse.json(SUGGEST_A);
      }),
    );
    const { result } = renderHook(() => useCoach(LONG_DRAFT));
    await act(async () => {
      result.current.triggerNow();
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(callCount).toBe(1);
  });

  it('clears the suggestion on a verdict=ok response', async () => {
    mockCoach(NEUTRAL);
    const { result } = renderHook(() => useCoach(LONG_DRAFT));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current.suggestion).toBeNull();
  });

  it('clears on 404 and caches it so a later call on a different draft skips the network', async () => {
    let callCount = 0;
    server.use(
      http.post(`${FUNCTIONS_BASE}/coach`, () => {
        callCount++;
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      }),
    );
    const { result, rerender } = renderHook(({ draft }) => useCoach(draft), { initialProps: { draft: LONG_DRAFT } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current.suggestion).toBeNull();
    expect(callCount).toBe(1);

    rerender({ draft: `${LONG_DRAFT} plus more distinct words entirely` });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(callCount).toBe(1);
  });

  it('clears on 429 without retrying', async () => {
    mockCoach({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': '60' } });
    const { result } = renderHook(() => useCoach(LONG_DRAFT));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current.suggestion).toBeNull();
  });

  it('leaves a currently-visible suggestion untouched when a superseded in-flight request is aborted', async () => {
    mockCoach(SUGGEST_A);
    const { result, rerender } = renderHook(({ draft }) => useCoach(draft), { initialProps: { draft: LONG_DRAFT } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current.suggestion).toEqual({ rewrite: 'rewrite A', reasoning: 'reasoning A' });

    mockCoach(SUGGEST_B, { delayMs: 5000 });
    rerender({ draft: `${LONG_DRAFT} a second materially different draft value` });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600); // debounce fires, slow fetch #2 starts (in-flight, unresolved)
    });

    rerender({ draft: `${LONG_DRAFT} a third materially different draft value` });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // triggers effect cleanup, aborting #2 before it settles
    });

    expect(result.current.suggestion).toEqual({ rewrite: 'rewrite A', reasoning: 'reasoning A' });
  });

  it('dismiss suppresses the same rewrite resurfacing for a whitespace-only edit, but a materially different draft resurfaces a new suggestion', async () => {
    mockCoach(SUGGEST_A);
    const { result, rerender } = renderHook(({ draft }) => useCoach(draft), { initialProps: { draft: LONG_DRAFT } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current.suggestion).not.toBeNull();

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.suggestion).toBeNull();

    mockCoach(SUGGEST_A);
    rerender({ draft: `${LONG_DRAFT}  ` });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current.suggestion).toBeNull();

    mockCoach(SUGGEST_B);
    rerender({ draft: `${LONG_DRAFT} plus enough new material to be a real edit` });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current.suggestion).toEqual({ rewrite: 'rewrite B', reasoning: 'reasoning B' });
  });

  it('clear() hides the suggestion immediately', async () => {
    mockCoach(SUGGEST_A);
    const { result } = renderHook(() => useCoach(LONG_DRAFT));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current.suggestion).not.toBeNull();

    act(() => {
      result.current.clear();
    });
    expect(result.current.suggestion).toBeNull();
  });

  it('aborts an in-flight request on unmount', async () => {
    let aborted = false;
    server.use(
      http.post(`${FUNCTIONS_BASE}/coach`, async ({ request }) => {
        await new Promise((resolve) => {
          request.signal.addEventListener('abort', () => {
            aborted = true;
            resolve(undefined);
          });
          setTimeout(resolve, 5000);
        });
        return HttpResponse.json(SUGGEST_A);
      }),
    );
    const { unmount } = renderHook(() => useCoach(LONG_DRAFT));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(aborted).toBe(true);
  });
});
