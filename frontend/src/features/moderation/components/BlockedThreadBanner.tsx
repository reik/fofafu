import { ShieldIcon } from '@/components/icons';

export interface BlockedThreadBannerProps {
  blocked: boolean;
  familyName: string;
}

/**
 * Variant B only (composer stays enabled, inbound-only restriction) — the
 * backend's DM decision (supabase/functions/moderation/index.ts's "DM
 * composer direction" comment) confirmed this over ui-designer's tentative
 * Variant A default. Renders above an unmodified `MessageComposer`; message
 * history above this banner is always rendered normally regardless, per the
 * resolved Open Question in
 * fofafu_vault/features/moderation-report-block.md.
 */
export function BlockedThreadBanner({ blocked, familyName }: BlockedThreadBannerProps) {
  if (!blocked) return null;
  return (
    <div className="flex items-start gap-2 rounded bg-surface-subtle p-3 text-sm text-ink-lead">
      <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <span className="block font-semibold">
          You&apos;ve limited this conversation with the {familyName} family.
        </span>
        <span className="mt-1 block text-ink-muted">
          Your message history stays here. You just won&apos;t get new messages from them.
        </span>
      </p>
    </div>
  );
}
