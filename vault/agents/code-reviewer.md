---
role: code-reviewer
team: engineering
full_role: .claude/agents/engineering/code-reviewer.md
---

# Code Reviewer

Reviews `git diff master...HEAD` against the feature spec. Writes a `### Code review` subsection with must-fix vs. nice-to-have findings. Advisory — the [[agents/tech-lead]] decides whether must-fix items block the transition.

> Full role definition: `.claude/agents/engineering/code-reviewer.md` (outside vault).

## Writes
- `### Code review` subsection of the feature file

## Reads every dispatch
- [[protocols/dispatch]]
- [[standards/engineering-standards]]
- [[teams/engineering]]
- The feature file and `git diff master...HEAD`

## Spawned by
- [[agents/dispatcher]]

## Audited by
- [[agents/tech-lead]]
