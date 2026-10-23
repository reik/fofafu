import { useEffect, useRef, useState } from 'react';
import { EdgeApiError } from '@/api/edgeClient';
import { coachComment } from '@/api/coach';

const MIN_DRAFT_LENGTH = 20;
const DEBOUNCE_MS = 600;

// Module-level, not component state: "the flag is off" is session-wide
// knowledge, not per-composer-instance knowledge. Resets on page reload,
// matching the spec's "one probe per session" language.
let seen404 = false;

export function resetCoachSessionCacheForTests(): void {
  seen404 = false;
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

interface Suggestion {
  rewrite: string;
  reasoning: string;
}

interface Dismissed {
  draftNormalized: string;
  rewrite: string;
}

interface Pending {
  timer: ReturnType<typeof setTimeout> | null;
  controller: AbortController | null;
}

export interface UseCoachResult {
  suggestion: Suggestion | null;
  dismiss: () => void;
  clear: () => void;
  triggerNow: () => void;
}

export function useCoach(draft: string): UseCoachResult {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const pendingRef = useRef<Pending>({ timer: null, controller: null });
  const dismissedRef = useRef<Dismissed | null>(null);

  function cancelPending(): void {
    if (pendingRef.current.timer) clearTimeout(pendingRef.current.timer);
    if (pendingRef.current.controller) pendingRef.current.controller.abort();
    pendingRef.current = { timer: null, controller: null };
  }

  function fireCheck(text: string): void {
    if (seen404 || normalize(text).length < MIN_DRAFT_LENGTH) return;

    const controller = new AbortController();
    pendingRef.current.controller = controller;

    coachComment({ draft: text }, { signal: controller.signal })
      .then((res) => {
        if (res.verdict !== 'suggest' || !res.rewrite) {
          setSuggestion(null);
          return;
        }
        const dismissed = dismissedRef.current;
        if (dismissed && dismissed.draftNormalized === normalize(text) && dismissed.rewrite === res.rewrite) {
          return;
        }
        setSuggestion({ rewrite: res.rewrite, reasoning: res.reasoning });
      })
      .catch((err: unknown) => {
        // Superseded by a newer draft — the request that lost the race must
        // never blank out a suggestion that's already visible from an
        // earlier, still-current response (would flicker the chip on every
        // keystroke while one is showing). Checked by `.name`, not
        // `instanceof DOMException` — fetch polyfills/interceptors (incl.
        // MSW's) can throw an AbortError from a different DOMException
        // realm/class than the global one, which would fail an instanceof
        // check while still being a real abort.
        if (err instanceof Error && err.name === 'AbortError') return;
        if (err instanceof EdgeApiError && err.status === 404) seen404 = true;
        setSuggestion(null);
      });
  }

  useEffect(() => {
    cancelPending();
    pendingRef.current.timer = setTimeout(() => {
      pendingRef.current.timer = null;
      fireCheck(draft);
    }, DEBOUNCE_MS);
    return () => {
      cancelPending();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  function triggerNow(): void {
    cancelPending();
    fireCheck(draft);
  }

  function dismiss(): void {
    if (suggestion) {
      dismissedRef.current = { draftNormalized: normalize(draft), rewrite: suggestion.rewrite };
    }
    setSuggestion(null);
  }

  function clear(): void {
    setSuggestion(null);
  }

  return { suggestion, dismiss, clear, triggerNow };
}
