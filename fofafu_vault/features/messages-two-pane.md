---
slug: messages-two-pane
title: Messages Two Pane
owner: engineering            # primary team: engineering | design | marketing
collaborators: []             # additional teams; dispatcher infers if empty
status: drafting              # drafting | speced | building | review | shipped | blocked | abandoned
priority: P2                  # P0 | P1 | P2
created: 2026-11-27
target: null                  # YYYY-MM-DD or null
links:
  kanban: "[[kanban/engineering]]"
  designs: "docs/screenshots/messages-two-pane/mock.png"
---

# Messages Two Pane

## Problem

`/messages` is a single narrow column (the thread list) with large empty space on both sides at desktop widths, and reading or replying to a thread means navigating away to `/messages/:userId`. Families should be able to read and reply without leaving the list, see who they are talking to (bio, open playdates), and be nudged toward new connections. Success: a desktop user can switch between conversations, reply, and request a playdate from one page. Approved layout mock: `docs/screenshots/messages-two-pane/mock.png`.

## Acceptance criteria

- [ ] At `md` and wider, `/messages` uses the same three-column grid as Home and Search (`240px | main | 240px`).
- [ ] Left column: conversation list (avatar, family name, last message preview, timestamp, unread count), a "Search conversations" filter, and "+ New message".
- [ ] Center column: the selected conversation renders in place (header, message bubbles, composer). Selecting a thread updates the URL to `/messages/:userId` so links and back/forward keep working; with no thread selected the center shows an empty state.
- [ ] Right column, "About this family": the selected family's avatar, name, location, bio, upcoming open playdate slots each with a Request action, and a "View family page" link.
- [ ] Right column, "Families to say hi to", selection rules (approved by the user 2026-11-27):
  - [ ] Exclude: the viewer's own family; blocked families in either direction; families the viewer already has a thread with (match family `ownerId` against thread `partnerId`).
  - [ ] Rank: same city first, then same state; then families with an upcoming open playdate slot; then most recently active.
  - [ ] Show at most 3, each with a one-line reason (e.g. "Also in Oakland", "Open Sat 10am") and a Message action.
  - [ ] **If no family qualifies, the "Families to say hi to" section is not rendered at all**: no heading, no empty-state card, no placeholder.
- [ ] Below `md`: today's behavior is unchanged (list page, then a separate thread page); the side rails are hidden.

## Out of scope

- Matching or ranking on household makeup (e.g. number of kids). Excluded deliberately as sensitive in a foster-family context.
- Real-time typing indicators and read receipts.
- The `/family/me` side rails (separate feature).

## Open questions

- Location ranking needs the viewer's city/state, which the frontend `FamilyDTO` does not expose today. Either extend `family/me` to return `city`/`state`, or have the server rank suggestions (e.g. a `community/suggested` endpoint). This is a backend change, so it ships as its own PR before the frontend one.
- "Most recently active" currently means `families.updated_at` (last profile edit). Is that good enough, or should it be last post or message?

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
