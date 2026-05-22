import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

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

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }

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
