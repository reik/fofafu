# fofafu — Foster Families, Rebuilt

A fresh rewrite of the [fofa](../fofa) foster-family community platform. Same product (announcements, comments, DMs, family profiles, search, uploads); new development model: **Claude Code subagents organized as a company**, with an Obsidian vault as the single source of truth.

## Quick start (for humans)

```bash
# Open the vault in Obsidian
open -a Obsidian ./vault

# Start a Claude Code session in this repo
claude
```

Then in Claude Code:

```
/new-feature user-profile      # scaffold a feature file + backlog card
/dispatch [[features/user-profile]]    # route through the agent teams
/standup                       # weekly cross-team digest
/sanity-check                  # full-sweep checks on demand
```

## How this repo is structured

| Path | Purpose |
|---|---|
| `vault/` | Obsidian planning surface — features, kanban boards, daily logs, team charters. **All tracked in git.** |
| `.claude/agents/` | Subagent definitions (dispatcher + engineering / design / marketing teams). |
| `.claude/commands/` | Slash commands that humans invoke. |
| `.claude/settings.json` | Permissions and hook stubs for scheduled sanity-check loops. |
| `backend/` | Express + better-sqlite3 + TS API. *Scaffolded in Phase 2.* |
| `frontend/` | React 18 + Vite + Tailwind SPA. *Scaffolded in Phase 3.* |

See [`CLAUDE.md`](./CLAUDE.md) for the full operating model and [`vault/protocols/dispatch.md`](./vault/protocols/dispatch.md) for the dispatcher handoff spec.

## Phases

- **Phase 1 (done):** repo + vault + agents + dispatcher + worked example.
- **Phase 2:** port backend feature-by-feature through the dispatcher.
- **Phase 3:** port frontend.
- **Phase 4 (deferred):** Expo mobile.

Track everything in `vault/kanban/company.md`.
