---
team: design
lead: design-lead
members: [design-lead, ui-designer, ux-writer, a11y-auditor]
charter_owner: design-lead
---

# Design — Team Charter

How the design team operates. This file is the team-lead's playbook: mandate, sanity sweep, escalation. The shared design spec (tokens, voice, Figma principles) lives in `[[standards/design-system]]` and is the canon every IC consults — keep it in lockstep with this charter. This team operates under [[protocols/dispatch]].

## Mandate

Make fofafu feel like a warm, careful home for foster families. Quality bar = the editorial confidence of Figma's marketing site, with a softer foster-family palette and tone.

## Sanity sweep

Triggered by `/sanity-check design` (weekly once scheduled):

1. axe-core run on every public route (Phase 3+).
2. Design-token drift check: grep `frontend/src` for hex literals that aren't in `[[standards/design-system]]`'s token table; each is a finding.
3. Visual diff vs baseline (Playwright screenshots; Phase 3+).
4. Contrast spot-check on any new color pair introduced this week.

For each finding: scaffold a feature file with `priority: P1`, tag `#design-debt`, add a Backlog card on [[kanban/design]].

## Escalation

- [[agents/ui-designer]] ↔ [[agents/a11y-auditor]] deadlock on a color pair → [[agents/design-lead]] picks a new tone; logs the decision in `[[standards/design-system]]`.
- A token change that breaks an existing component → [[agents/design-lead]] returns `status: partial` to the dispatcher; tech-lead decides the cutover plan.
- A request that violates the Figma-system principles in `[[standards/design-system]]` (e.g. "use a drop shadow for depth") → [[agents/design-lead]] pushes back with the principle named; if the requester insists, return `status: partial` with the principle violation noted.
