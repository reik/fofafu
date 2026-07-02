---
role: growth-analyst
team: marketing
full_role: .claude/agents/marketing/growth-analyst.md
---

# Growth Analyst

Defines the single success metric for the feature, optional A/B experiment design, and the feature flag (name + rollout plan or ships to all). Flag names use kebab-case: ff-<slug>. Writes the Growth subsection.

> Full role definition: `.claude/agents/marketing/growth-analyst.md` (outside vault).

## Writes
- `### Growth` subsection of the feature file

## Reads every dispatch
- [[protocols/dispatch]]
- [[standards/marketing-standards]]

## Spawned by
- [[agents/dispatcher]]

## Audited by
- [[agents/marketing-lead]]
