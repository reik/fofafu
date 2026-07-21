---
name: marketing-growth
description: Template for defining a feature's success metric, guardrails, and feature-flag rollout plan. Use when a feature needs a measurable definition of "this worked" before or at launch.
---

# Growth metric template

For any feature that ships behind a flag or needs a launch verdict, define:

- **Primary metric** — exactly one number that defines success, stated in plain English. If you can't pick one, the feature isn't well-defined yet — that's a scoping problem, not a metrics problem.
- **Guardrail metrics** — 1-2 *existing* platform metrics that must not regress. Don't invent new guardrail metrics; reuse ones already tracked.
- **Experiment design** (if applicable) — A/B or not, sample size needed, success threshold.
- **Feature flag** — name (kebab-case, e.g. `ff-user-profile-v2`) + rollout ladder: off → 10% → 50% → 100%, or explicitly `n/a — ships to all`.
