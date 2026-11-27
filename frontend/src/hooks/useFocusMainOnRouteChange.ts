import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { MEDIA_MD } from './useMediaQuery';

const MESSAGES_PATH = /^\/messages(\/[^/]+)?$/;

/**
 * At md and wider, /messages and /messages/:userId are one page whose
 * centre column takes focus when the selected conversation changes
 * (fofafu_vault/features/messages-two-pane.md, Accessibility req 15).
 * Moving focus to <main> there would undo that and send keyboard users
 * back to the top of the conversation list.
 */
function isMessagesPaneSwitch(from: string, to: string): boolean {
  return MESSAGES_PATH.test(from) && MESSAGES_PATH.test(to) && window.matchMedia(MEDIA_MD).matches;
}

/**
 * Moves keyboard focus to the page's `<main>` landmark whenever the route
 * pathname changes. Preserves browser defaults on the very first render
 * (no fight with the initial page load) and on anchor jumps where the user
 * expects focus to land on the anchored element instead.
 *
 * The hook targets the element with `id="main"` — the same target as the
 * skip-link in `Layout.tsx` — so screen readers narrate the new page from
 * its top landmark and Tab navigation resumes from a sensible position.
 */
export function useFocusMainOnRouteChange(): void {
  const location = useLocation();
  const isInitialRender = useRef(true);
  const previousPathname = useRef(location.pathname);

  useEffect(() => {
    const from = previousPathname.current;
    previousPathname.current = location.pathname;

    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }

    if (isMessagesPaneSwitch(from, location.pathname)) return;

    if (location.hash) {
      // Anchor jump — let the browser place focus on the target element.
      return;
    }

    const main = document.getElementById('main');
    if (main instanceof HTMLElement) {
      main.focus();
    }
  }, [location.pathname, location.hash]);
}
