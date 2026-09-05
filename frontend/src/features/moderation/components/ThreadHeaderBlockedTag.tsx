export interface ThreadHeaderBlockedTagProps {
  blocked: boolean;
}

/**
 * Renders only when the thread partner is blocked — not a hidden/empty
 * variant, simply absent otherwise (matches the "0 unread -> doesn't
 * render" precedent Navbar's badge follows). Reuses FamilyHeader's
 * kidCount-pill treatment verbatim per
 * fofafu_vault/features/moderation-report-block.md ### Visual §1.5.
 */
export function ThreadHeaderBlockedTag({ blocked }: ThreadHeaderBlockedTagProps) {
  if (!blocked) return null;
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-surface-card px-3 py-1 text-xs font-semibold text-ink-muted shadow-lift">
      Blocked
    </span>
  );
}
