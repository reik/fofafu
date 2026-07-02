---
slug: moderation-report-block
title: Moderation — report and block
owner: engineering
collaborators: [design, marketing]
status: drafting
priority: P2
created: 2026-06-12
target: null
links:
  kanban: "[[kanban/company]]"
  designs: null
---

# Moderation — report and block

## Problem

A foster-family community needs lightweight, after-the-fact moderation tools. Even with the reply-coach in place to soften draft comments, some content will still land that another family needs to flag, and some families will reach a point where one family doesn't want to see another's posts or receive their DMs. Without `report` and `block`, the only available escape valves are "leave the platform" or "ask an admin manually" — both too heavy for the kind of low-grade interpersonal friction this community will produce.

Success = a foster family can (a) report a specific post, comment, or DM in two taps, and (b) block another family in one tap from their profile, with both actions producing visible, immediate effects (reporter sees a confirmation; blocker stops seeing the blocked family entirely).

## Acceptance criteria

- [ ] Report flow available on every announcement, comment, and DM (icon in the existing action row, not a new surface).
- [ ] Report categories are short and foster-family-appropriate (not generic "spam / abuse / other" — voice owned by ux-writer).
- [ ] Reports persist with `{reporterId, targetType, targetId, category, note?, createdAt}` and are visible to an admin queue (admin tool is out of scope; the data lands).
- [ ] Block flow available on the family profile page and from any post/comment by that family.
- [ ] A blocked family is invisible to the blocker: their announcements vanish from the feed, their comments vanish from threads, their DMs vanish from the threads list, search excludes them.
- [ ] Block is one-way: the blocker sees nothing; the blocked family is not notified.
- [ ] Reporting and blocking are independent actions — reporting does not auto-block, blocking does not auto-report.

## Out of scope

- Admin moderation queue UI. The report data lands; reading it is a separate feature.
- Auto-moderation / classifier-based hiding. Coaching at write-time (reply-coach) is the prevention surface; this feature is the after-the-fact surface only.
- Block-list management screen. v1 surfaces unblock only on the previously-blocked family's profile (which the blocker can navigate to via the block UI confirmation).
- Reporting a *family* (vs. a post/comment/DM by that family). Channel-specific reports only in v1.

## Open questions

- Should blocks hide *historical* comments by the blocked family in already-read threads, or just future ones? (Hiding historical = more complete escape, but breaks thread readability for the blocker.)
- Where do report categories sit on the spectrum from "vague enough to be safe" to "specific enough to be useful for an admin"? Needs ux-writer.
- Should reports against the same target deduplicate per reporter, or accumulate? (Dedupe = cleaner data; accumulate = more honest engagement signal.)
- DM blocks: when family A blocks family B, does the existing thread stay readable for A in case there's prior context A needs, or vanish entirely?

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend
*(filled by frontend-dev)*

### Test plan
*(filled by qa-engineer)*

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
