---
description: "Run on-demand sanity sweeps. No argument runs all three teams. Pass a team name to run only that team."
argument-hint: "[engineering | design | marketing]"
---

## Usage

```
/sanity-check               # all three
/sanity-check engineering   # tsc, eslint, vitest, coverage
/sanity-check design        # axe-core, design-token drift, visual diff
/sanity-check marketing     # links, README/CHANGELOG freshness, SEO meta
```

## Body

You have been invoked via `/sanity-check $ARGUMENTS`.

1. Parse `$ARGUMENTS`. Empty → run all three; otherwise restrict to the named team.
2. For each requested team, spawn the team-lead via the `Agent` tool with prompt:
   ```
   Run the team sanity sweep documented in fofafu_vault/teams/<team>.md `## Sanity sweep` section.
   For each finding, create a new feature file (priority P1, tag #bug) and a Backlog card.
   Return: { team, findings_count, blocking_count, slugs_created }.
   ```
3. Aggregate the per-team returns into a single summary and append a log line:
   `- HH:MM #team/dispatch sanity-check: eng=<n> design=<n> marketing=<n>`
4. Return the summary.
