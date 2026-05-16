# fofafu — Operating Model for Claude Code

This file is loaded automatically at session start. It tells you (Claude) and any subagent how this project is organized and how to do work in it.

## Product

Rewriting [fofa](../fofa): a foster-family community platform. Features: announcements feed (posts, comments, reactions), direct messaging, family member profiles, community search, email-verified auth, image uploads. Same product, fresh codebase, **new development model**.

## The development model: a company, not a queue

There is no separate ticket system. There is no Slack. Planning artifacts live in `vault/` (Obsidian-rendered markdown) and are tracked in git. Humans open `vault/` in Obsidian; agents read/write the same files.

The **dispatcher** (`.claude/agents/dispatcher.md`, code-name *the patcher*) is the only entry point. Humans never invoke an IC directly. Humans run `/dispatch <feature-link>`; the dispatcher routes to team-leads; team-leads delegate to specialists.

### Org chart

```
dispatcher (the patcher)
├── engineering  → tech-lead → backend-dev | frontend-dev | mobile-dev | qa-engineer
├── design       → design-lead → ui-designer | ux-writer | a11y-auditor
└── marketing    → marketing-lead → content-writer | seo-specialist | growth-analyst
```

Read each role's responsibilities in `.claude/agents/<team>/<role>.md`.

## The vault

```
vault/
├── README.md
├── .obsidian/                # workspace config (committed, except workspace.json caches)
├── features/                 # one .md per feature with YAML frontmatter
│   ├── _template.md
│   └── <slug>.md
├── kanban/                   # one board per team + a roll-up
│   ├── engineering.md
│   ├── design.md
│   ├── marketing.md
│   └── company.md
├── log/                      # append-only daily logs
│   ├── YYYY-MM-DD.md
│   └── standups/YYYY-WW.md
├── teams/                    # team charters (read by leads)
├── protocols/                # cross-cutting specs
│   └── dispatch.md           # handoff protocol — read this BEFORE delegating
└── plans/                    # phase plans, RFCs
```

## Writer ownership (the only race-prevention rule)

Multiple agents writing the same file in the same turn = data loss. So:

| File | Sole writer |
|---|---|
| `vault/features/<slug>.md` frontmatter `status` | dispatcher |
| `vault/features/<slug>.md` body sections | the team that owns the section (Acceptance ↔ tech-lead; Designs ↔ design-lead; Launch copy ↔ marketing-lead) |
| `vault/kanban/company.md` | dispatcher |
| `vault/kanban/engineering.md` | engineering tech-lead |
| `vault/kanban/design.md` | design-lead |
| `vault/kanban/marketing.md` | marketing-lead |
| `vault/log/<date>.md` | append-only by anyone; never edit existing lines |
| `vault/teams/<team>.md` | the team's lead (charter changes go through them) |

ICs never edit kanban boards directly — they message their lead via the Agent tool's return value, and the lead updates the board. ICs DO append to the log.

## Status state machine

```
drafting → speced → building → review → shipped
   │          │         │         │
   ▼          ▼         ▼         ▼
       blocked / abandoned   (off-ramps; reachable from any pre-terminal state)
```

Only the dispatcher writes the `status` field on a feature file. Leads can request a transition by responding with `requested_status: <next>` — the dispatcher applies it after sanity-checking the kanban.

## Commands

| Command | What it does |
|---|---|
| `/new-feature <slug>` | Scaffold `vault/features/<slug>.md` from template + a Backlog card on the right kanban. |
| `/dispatch <feature-link>` | Run the dispatcher on a feature. Routes, delegates, aggregates, logs. |
| `/sanity-check [team]` | Run on-demand sanity sweeps. With no arg, all three teams run. |
| `/standup` | Aggregate the week's log entries and kanban movement into `vault/log/standups/YYYY-WW.md`. |

## Conventions and rules

- **Tech stack** (per `~/.claude/rules.md`): React 18 + TS strict + Vite + Tailwind + TanStack Query + Zustand + RHF/Zod + Vitest on frontend; Express + better-sqlite3 + TS on backend.
- **Commit convention**: Conventional Commits (`feat(area): …`, `fix:`, `chore:`, `vault:` for vault-only changes).
- **Branch naming**: `feat/<slug>`, `fix/<slug>`, `vault/<topic>`.
- **No TODOs without a feature file** — if it's worth a TODO, it's worth a feature file.
- **All work flows through the dispatcher.** If you find yourself doing work for a human without a feature file, stop and `/new-feature` first.

## When you (Claude or a subagent) are activated

1. Read this file (you're doing that now).
2. Read `vault/protocols/dispatch.md` — the handoff contract.
3. Read your role file at `.claude/agents/<team>/<role>.md` (if subagent) or `.claude/agents/dispatcher.md` (if invoked via `/dispatch`).
4. Read the feature file you've been handed (frontmatter + relevant section).
5. Do the work. Update files only where you have writer ownership.
6. Append a log entry to today's `vault/log/YYYY-MM-DD.md`.
7. Return a structured response (see protocol).

## Phases

- **Phase 1 (this commit):** repo + vault + agents + dispatcher + worked example.
- **Phase 2:** port backend feature-by-feature through the dispatcher.
- **Phase 3:** port frontend.
- **Phase 4 (deferred):** Expo mobile.
