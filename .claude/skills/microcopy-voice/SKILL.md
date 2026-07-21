---
name: microcopy-voice
description: Voice-and-tone checklist plus format templates for product microcopy (labels, placeholders, validation/empty/error states) and launch copy (release notes, social, email, landing blocks). Use when writing any user-facing string or announcing a shipped feature, so both surfaces stay in one consistent voice.
---

# Microcopy & voice

Two surfaces share one voice: **in-product strings** (labels, empty states, errors) and **launch copy** (release notes, social, email, landing blocks). Keeping them in one skill is deliberate — when the two are specced separately they tend to drift apart on tone.

## Voice rules

- Plural "we", never "I" — speak as the platform.
- Active voice, short sentences, one verb per sentence when possible.
- Warm, plain-spoken; never saccharine, never patronising.
- No exclamation marks except in CTAs.
- No emoji unless explicitly requested.
- Pill/CTA copy is imperative ("See your family page", "Send a message") — never "Click here".
- Lead with what changed for the user, not the technical mechanism.

## In-product strings

Produce a string table:

```
| key | string |
|---|---|
| profile.title | Your family's page |
| profile.empty.cta | Tell us about your family |
| profile.save.success | Saved — your page is live |
```

Cover: labels, placeholders, validation messages, empty states, errors, confirmations.

## Launch copy

For a shipped or shipping feature, produce:

- **Release note** (≤ 80 words).
- **Social post** (≤ 240 chars).
- **Email subject + first line** (if the feature has an email touchpoint).
- **Landing-page block** (heading + one paragraph + CTA pill text) — only for features significant enough to warrant a landing update.

## Scope discipline

Write copy; don't redesign the surface it lives on. If a string doesn't fit the space a designer specced, flag it rather than silently shortening it in a way that loses meaning.
