---
slug: claude-content-moderation
title: Claude Content Moderation
owner: engineering            # primary team: engineering | design | marketing
collaborators: []             # additional teams; dispatcher infers if empty
status: drafting              # drafting | speced | building | review | shipped | blocked | abandoned
priority: P2                  # P0 | P1 | P2
created: 2026-09-26
target: null                  # YYYY-MM-DD or null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
---

# Claude Content Moderation

## Problem

[[features/moderation-report-block]] gives families after-the-fact tools (report, block), and [[features/reply-coach]] nudges authors at write-time, but nothing screens content *before* other families see it. Every harmful post, comment, or DM lands in front of the community until someone reports it. That matters here: posts often involve children in care, so identifying details about a foster child, harassment, or self-harm content can do real harm while waiting for a report. The fix is to send new user-generated text to the Claude API for classification at write time, and to hold or flag content that crosses a policy line.

Success = clearly violating content never appears in the feed/threads/DMs of other families, borderline content lands in the existing reports data for a human, and ordinary posts see no noticeable delay or false blocking.

## Acceptance criteria

- [ ] New announcements, comments, and DMs are classified server-side (Supabase edge function) via the Claude API before they become visible to other families.
- [ ] Classification returns a structured verdict `{decision: allow | flag | hold, categories[], reason}` validated with a Zod schema — malformed model output is treated as a failure, not an allow.
- [ ] `hold` content is visible only to its author, with a clear, non-shaming explanation; `flag` content is published but written into the existing reports table (from [[features/moderation-report-block]]) with a system reporter.
- [ ] Moderation policy (categories + thresholds) lives in one versioned prompt/config file, including a foster-family-specific category for identifying details of children in care.
- [ ] Claude API failure/timeout behaviour is explicit and tested (see open question on fail-open vs fail-closed).
- [ ] `ANTHROPIC_API_KEY` is read from Supabase secrets only; the key never reaches the frontend.
- [ ] Tests run against mock fixtures (same pattern as `supabase/functions/coach`) — CI never calls the live API.

## Out of scope

- Admin moderation queue UI (still owned by a separate future feature).
- Image moderation of uploads — text only in v1.
- Retroactive scanning of existing content.
- Replacing reply-coach; coach stays the gentle author-side nudge, this is the enforcement layer.

## Open questions

- Fail-open or fail-closed when the Claude API is down/slow? (Fail-closed = hold everything; fail-open = publish and queue for re-check.)
- Model choice: `claude-haiku-4-5-20251001` for cost/latency is the default proposal. Also: `coach` is still pinned to the retired `claude-3-5-haiku-20241022` — migrate it here or as a separate fix?
- Sync (author waits ~1s) vs async (publish, then retract on hold) classification?
- Should DMs be moderated at all, or only flagged on report, given privacy expectations?
- Share one `_shared/claude.ts` client between `coach` and moderation?

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend
*(filled by frontend-dev)*

### Test plan
*(filled by qa-engineer)*

### E2E coverage
*(filled by e2e-test-writer; "No E2E coverage" if the feature is backend-only)*

### Code review
*(filled by code-reviewer; populated during building → review, not at speccing time)*

## Design — Spec

### Visual
*(filled by ui-designer)*

### Microcopy
*(filled by ux-writer)*

### Accessibility
*(filled by a11y-auditor)*

## Marketing — Spec

### Launch copy
*(filled by content-writer)*

### SEO
*(filled by seo-specialist)*

### Growth
*(filled by growth-analyst)*
