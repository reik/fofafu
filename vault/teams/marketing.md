---
team: marketing
lead: marketing-lead
members: [marketing-lead, content-writer, seo-specialist, growth-analyst]
charter_owner: marketing-lead
---

# Marketing — Team Charter

## Mandate

Help foster families find fofafu, and help them feel met when they arrive. We exist *for* foster families, not *about* them. Plain language, no jargon, no growth-hack manipulation.

## Positioning

- **Audience**: foster parents, kinship caregivers, and the social workers supporting them.
- **One-liner**: "A quieter place for foster families to talk to each other."
- **What we are not**: a Facebook group, a casework tool, an agency portal.

## Voice

- Warm, plain, never patronising.
- Lead with what changed for the family, not the technical mechanism.
- One verb per sentence when possible.
- Pill CTAs in imperative ("See your family page"); never "Click here".
- Emoji only when the feature file requests them.

## SEO defaults

- Title pattern: `<Page> · fofafu`.
- All public pages have OG image (1200×630), description ≤155 chars, canonical URL.
- Authenticated views are `noindex` unless flagged otherwise.
- One sitemap per public area; submit on each release.

## Sanity sweep

Triggered by `/sanity-check marketing` (weekly once scheduled):

1. Link check: `lychee` (or curl) across README, CHANGELOG, every public page.
2. README + CHANGELOG freshness: were they updated this release?
3. SEO meta validation: title length, description length, OG image presence on every public route.
4. Voice consistency spot-check on any string added in the last week.

For each finding: scaffold a feature file with `priority: P2`, tag `#marketing-debt`, add a Backlog card on `marketing.md`.

## Growth philosophy

- One primary metric per feature. If a feature doesn't have one, push back on the spec.
- Guardrails are existing platform metrics (we do not invent new ones for guardrails).
- Feature flags only when the rollout actually needs gating; otherwise ship to everyone.

## Escalation

- A primary metric that conflicts with another feature's primary metric → marketing-lead returns `status: partial`; dispatcher raises to human review.
- A launch where engineering and design are ready but marketing copy is stuck → return `status: partial` so dispatcher can ship behind a flag and unblock writers.
