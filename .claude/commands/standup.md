---
description: "Aggregate this week's log entries and current kanban state into vault/log/standups/YYYY-WW.md."
argument-hint: ""
---

## Body

You have been invoked via `/standup`.

1. Determine the current ISO week: `<YYYY>-W<WW>`.
2. Read every `vault/log/YYYY-MM-DD.md` for the dates in this ISO week (Mon–Sun).
3. Read all four kanban files (`engineering.md`, `design.md`, `marketing.md`, `company.md`).
4. Write `vault/log/standups/<YYYY-WW>.md` with this structure:

```markdown
# Standup — Week <WW> of <YYYY> (<Mon>–<Sun>)

## Engineering
- Shipped: <feature links from `## Done` added this week>
- In flight: <links from `## In Progress`>
- Blocked: <links from `## Blocked` with reason>

## Design
…

## Marketing
…

## Cross-cutting
- <#escalation log entries this week>
- <decisions needed>
```

5. Append a log line to today's log: `- HH:MM #team/dispatch [[log/standups/<YYYY-WW>]] — standup compiled`
6. Return the path to the standup file.
