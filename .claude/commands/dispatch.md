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

## Pre-flight (main session — BEFORE spawning the dispatcher subagent)

Run these checks in the main session. A subagent cannot change the parent shell's branch, so the main session must do this first.

1. Parse `$ARGUMENTS` into `{slug, flags}`. Accept either `slug`, `[[features/slug]]`, or `features/slug`.
2. **Feature branch check.** Run `git branch --show-current`.
   - If the current branch is already `feat/<slug>` (or `fix/<slug>` / `vault/<topic>` for non-feat work, per `CLAUDE.md` Conventions) → continue.
   - If the current branch is `master` / `main` → create and switch: `git checkout -b feat/<slug>`. Any uncommitted scaffold (the feature file, kanban edits, log line from `/new-feature`) is carried over, which is the desired behavior.
   - If the current branch is some other feature branch (`feat/<other-slug>`) → refuse with `wrong_branch` and ask the human whether to switch to a new branch or finish the current one first. Do NOT silently switch.
3. Skip-flag exception: `--ship` and `--abandon` are vault-only operations that can run on any branch (typically `master`); skip the branch check for those.

## Body (handed to the dispatcher subagent)

You have been invoked via `/dispatch $ARGUMENTS`.

1. Parse `$ARGUMENTS` into `{slug, flags}`. Accept either `slug`, `[[features/slug]]`, or `features/slug`.
2. Read `vault/features/<slug>.md`. If it does not exist, return `feature_not_found` and instruct the caller to run `/new-feature <slug>`.
3. **Branch verification.** Run `git branch --show-current`. If the branch is `master` / `main` (and the invocation is not `--ship` or `--abandon`), refuse with `wrong_branch`: the main session must `git checkout -b feat/<slug>` before invoking you. Do not attempt to switch branches yourself — your shell is a subagent shell and a `git checkout` here does not affect the parent session.
4. Follow your loop as documented in `.claude/agents/dispatcher.md`. Use parallel `Agent` calls for team-leads.
5. Return the structured summary to the caller.
