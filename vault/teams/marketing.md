---
team: marketing
lead: marketing-lead
members: [marketing-lead, content-writer, seo-specialist, growth-analyst]
charter_owner: marketing-lead
---

# Marketing — Team Charter

How the marketing team operates. This file is the marketing-lead's playbook: mandate, growth philosophy, sanity sweep, escalation. The shared marketing spec (positioning, voice, SEO defaults) lives in `[[standards/marketing-standards]]` and is the canon every IC consults — keep it in lockstep with this charter.

## Mandate

Help foster families find fofafu, and help them feel met when they arrive. We exist *for* foster families, not *about* them. Plain language, no jargon, no growth-hack manipulation.

## Growth philosophy

- One primary metric per feature. If a feature doesn't have one, push back on the spec.
- Guardrails are existing platform metrics (we do not invent new ones for guardrails).
- Feature flags only when the rollout actually needs gating; otherwise ship to everyone.

## Sanity sweep

Triggered by `/sanity-check marketing` (weekly once scheduled):

1. Link check: `lychee` (or curl) across README, CHANGELOG, every public page.
2. README + CHANGELOG freshness: were they updated this release?
3. SEO meta validation: title length, description length, OG image presence on every public route. Spec lives in `[[standards/marketing-standards]]`.
4. Voice consistency spot-check on any string added in the last week, against `[[standards/marketing-standards]]` Voice section.

For each finding: scaffold a feature file with `priority: P2`, tag `#marketing-debt`, add a Backlog card on `kanban/marketing.md`.

## Escalation

- A primary metric that conflicts with another feature's primary metric → marketing-lead returns `status: partial`; dispatcher raises to human review.
- A launch where engineering and design are ready but marketing copy is stuck → return `status: partial` so dispatcher can ship behind a flag and unblock writers.
- A positioning or voice change proposed mid-launch → land it in `[[standards/marketing-standards]]` first, then update the launch copy; never the other way around.
