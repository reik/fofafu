---
description: "Scaffold a new feature: creates fofafu_vault/features/<slug>.md from the template and adds a Backlog card on the appropriate team kanban + the company kanban."
argument-hint: "<slug> [--owner=<team>] [--priority=P0|P1|P2]"
---

## Usage

```
/new-feature user-profile
/new-feature retention-email --owner=marketing --priority=P1
```

## Body

You have been invoked via `/new-feature $ARGUMENTS`.

1. Parse `$ARGUMENTS` into `{slug, owner=engineering, priority=P2}`.
2. If `fofafu_vault/features/<slug>.md` already exists, refuse with `feature_already_exists`.
3. Copy `fofafu_vault/features/_template.md` to `fofafu_vault/features/<slug>.md`. Fill in:
   - `slug: <slug>`
   - `title: <Title Case of slug>`
   - `owner: <owner>`
   - `collaborators: []` (the dispatcher will infer at routing time)
   - `status: drafting`
   - `priority: <priority>`
   - `created: <today YYYY-MM-DD>`
   - `target: null`
4. Add a Backlog card to `fofafu_vault/kanban/<owner>.md` under `## Backlog`:
   `- [ ] [[features/<slug>]] @<owner>`
5. Add a Backlog card to `fofafu_vault/kanban/company.md` under `## Backlog`:
   `- [ ] [[features/<slug>]]`
6. Append a log line to `fofafu_vault/log/<today>.md`:
   `- HH:MM #team/dispatch [[features/<slug>]] — feature scaffolded (owner=<owner>, status=drafting)`
7. Return:
   ```
   slug: <slug>
   path: fofafu_vault/features/<slug>.md
   next: /dispatch <slug>
   ```
