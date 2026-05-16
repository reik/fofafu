---
description: "Route a feature through the agent company. The dispatcher classifies which teams must work on it, spawns the team-leads in parallel, aggregates their returns, transitions the feature status, updates the company kanban, and writes the routing log."
argument-hint: "<feature-slug | [[features/slug]] | slug --ship | slug --abandon>"
---

## Usage

```
/dispatch user-profile
/dispatch [[features/user-profile]]
/dispatch user-profile --ship      # feature is in Review and ready to ship
/dispatch user-profile --abandon   # mark feature abandoned
```

## What happens

1. The `dispatcher` subagent is spawned with the slug.
2. It reads `vault/features/<slug>.md`, classifies which teams are involved, and spawns team-leads via the `Agent` tool.
3. Team-leads delegate to specialists, write back into the feature spec, and update their team's kanban.
4. The dispatcher aggregates all returns, updates `vault/kanban/company.md`, transitions the feature `status` field, and appends a routing summary to `vault/log/<today>.md`.

If `<feature-slug>` is missing, `/dispatch` refuses and points to `/new-feature <slug>`.

See `vault/protocols/dispatch.md` for the full protocol (state machine, retry/escalation, log format).

## Body (handed to the dispatcher subagent)

You have been invoked via `/dispatch $ARGUMENTS`.

1. Parse `$ARGUMENTS` into `{slug, flags}`. Accept either `slug`, `[[features/slug]]`, or `features/slug`.
2. Read `vault/features/<slug>.md`. If it does not exist, return `feature_not_found` and instruct the caller to run `/new-feature <slug>`.
3. Follow your loop as documented in `.claude/agents/dispatcher.md`. Use parallel `Agent` calls for team-leads.
4. Return the structured summary to the caller.
