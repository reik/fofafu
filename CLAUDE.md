# fofafu — Operating Model for Claude Code

This file is loaded automatically at session start. It tells you (Claude) and any subagent how this project is organized and how to do work in it.

## Product

Rewriting [fofa](../fofa): a foster-family community platform. Features: announcements feed (posts, comments, reactions), direct messaging, family member profiles, community search, email-verified auth, image uploads. Same product, fresh codebase, **new development model**.

## The development model: a company, not a queue

There is no separate ticket system. There is no Slack. Planning artifacts live in `fofafu_vault/` (Obsidian-rendered markdown) and are tracked in git. Humans open `fofafu_vault/` in Obsidian; agents read/write the same files.

The **dispatcher** (`.claude/agents/dispatcher.md`, code-name *the patcher*) is the only entry point. Humans never invoke an IC directly. Humans run `/dispatch <feature-link>`; the dispatcher classifies which teams must work on the feature, fans out specialists in parallel, and then spawns each team-lead as an aggregator to audit and close out the team's section. (Two-level spawn — see `fofafu_vault/protocols/dispatch.md` §2 for why.)

### Org chart

```
dispatcher (the patcher)
├── engineering  → tech-lead → backend-dev | frontend-dev | mobile-dev | qa-engineer | e2e-test-writer | code-reviewer
├── design       → design-lead → ui-designer | ux-writer | a11y-auditor
└── marketing    → marketing-lead → content-writer | seo-specialist | growth-analyst
```

Read each role's responsibilities in `.claude/agents/<team>/<role>.md`.

## The vault

```
fofafu_vault/
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
├── teams/                    # team charters: mandate, sanity sweep, escalation (read by leads)
├── standards/                # shared specs, the canon every IC consults
│   ├── design-system.md      # tokens, voice, Figma principles
│   ├── engineering-standards.md  # stack, conventions
│   └── marketing-standards.md    # positioning, voice, SEO defaults
├── protocols/                # cross-cutting specs
│   └── dispatch.md           # handoff protocol — read this BEFORE delegating
└── plans/                    # phase plans, RFCs
```

## Writer ownership (the only race-prevention rule)

Multiple agents writing the same file in the same turn = data loss. So:

| File | Sole writer |
|---|---|
| `fofafu_vault/features/<slug>.md` frontmatter `status` | dispatcher |
| `fofafu_vault/features/<slug>.md` body subsections (`### Backend`, `### Frontend`, `### Test plan`, `### E2E coverage`, `### Code review`, `### Visual`, `### Microcopy`, `### Accessibility`, `### Launch copy`, `### SEO`, `### Growth`) | the specialist who owns that subsection (backend-dev, frontend-dev, qa-engineer, e2e-test-writer, code-reviewer, ui-designer, ux-writer, a11y-auditor, content-writer, seo-specialist, growth-analyst). Leads do light editorial only — no rewrites. |
| `fofafu_vault/kanban/company.md` | dispatcher |
| `fofafu_vault/kanban/engineering.md` | engineering tech-lead |
| `fofafu_vault/kanban/design.md` | design-lead |
| `fofafu_vault/kanban/marketing.md` | marketing-lead |
| `fofafu_vault/log/<date>.md` | append-only by anyone; never edit existing lines |
| `fofafu_vault/teams/<team>.md` | the team's lead (charter changes go through them) |
| `fofafu_vault/standards/<spec>.md` | the team's lead (token / stack / positioning changes go through them) |
| `docs/user-guide.md` | content-writer (updated automatically on each `--ship`). Structural reorganisation requires `/new-feature` and dispatcher flow. |

ICs never edit kanban boards directly. ICs DO append to the log and write their own subsection of the feature spec. Under the 2-level model, ICs return to the dispatcher (which spawned them); the team-lead is spawned afterwards, reads the spec sections, and moves the team's kanban card to Review.

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
| `/new-feature <slug>` | Scaffold `fofafu_vault/features/<slug>.md` from template + a Backlog card on the right kanban. |
| `/dispatch <feature-link>` | Run the dispatcher on a feature. Routes, delegates, aggregates, logs. |
| `/sanity-check [team]` | Run on-demand sanity sweeps. With no arg, all three teams run. |
| `/standup` | Aggregate the week's log entries and kanban movement into `fofafu_vault/log/standups/YYYY-WW.md`. |

## Conventions and rules

- **Tech stack** (per `~/.claude/rules.md`): React 18 + TS strict + Vite + Tailwind + TanStack Query + Zustand + RHF/Zod + Vitest on frontend; Express + better-sqlite3 + TS on backend.
- **Commit convention**: Conventional Commits (`feat(area): …`, `fix:`, `chore:`, `vault:` for vault-only changes).
- **Branch naming**: `feat/<slug>`, `fix/<slug>`, `vault/<topic>`.
- **No TODOs without a feature file** — if it's worth a TODO, it's worth a feature file.
- **All work flows through the dispatcher.** If you find yourself doing work for a human without a feature file, stop and `/new-feature` first.

## When you (Claude or a subagent) are activated

1. Read this file (you're doing that now).
2. Read `fofafu_vault/protocols/dispatch.md` — the handoff contract.
3. Read your role file at `.claude/agents/<team>/<role>.md` (if subagent) or `.claude/agents/dispatcher.md` (if invoked via `/dispatch`).
4. Read the feature file you've been handed (frontmatter + relevant section).
5. Do the work. Update files only where you have writer ownership.
6. Append a log entry to today's `fofafu_vault/log/YYYY-MM-DD.md`.
7. Return a structured response (see protocol).

## Phases

- **Phase 1 (this commit):** repo + vault + agents + dispatcher + worked example.
- **Phase 2:** port backend feature-by-feature through the dispatcher.
- **Phase 3:** port frontend.
- **Phase 4 (deferred):** Expo mobile.
- **Phase 5 (in progress):** infra migration off Render — [[features/migrate-render-to-vercel-supabase]]. Frontend → Vercel, backend Express → Supabase Edge Functions, sqlite → Supabase Postgres, uploads → Supabase Storage, auth → Supabase Auth. Blocked on user creating Supabase + Vercel projects and sharing connection details.
