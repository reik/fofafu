import type { ReportTargetType } from '@/api/moderation';

/**
 * Display-layer word for a report/moderation target, decoupled from the
 * persisted `targetType` string per
 * fofafu_vault/features/moderation-report-block.md ### Microcopy: "post"
 * matches the existing colloquial precedent even though the data model says
 * "announcement"; "message" matches the existing DM-composer CTA precedent.
 */
export const CONTENT_TYPE_LABEL: Record<ReportTargetType, string> = {
  announcement: 'post',
  comment: 'comment',
  message: 'message',
};

export function contentTypeLabel(targetType: ReportTargetType): string {
  return CONTENT_TYPE_LABEL[targetType];
}
