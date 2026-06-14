# vault — the planning surface

This vault is the single source of truth for fofafu's planning. Humans browse it in Obsidian; Claude Code subagents read and write the same markdown files.

## How to use it

1. Install Obsidian → "Open folder as vault" → select this directory.
2. Install the **Kanban** community plugin (it's already enabled in `community-plugins.json`). Settings → Community plugins → Browse → "Kanban" → Install.
3. Open `kanban/company.md` for the cross-team board, or any team kanban for that team's view.

The vault is fully tracked in git — kanban movements, daily logs, and standups are commits. The only files excluded are Obsidian's pane-layout caches (`workspace.json`, `workspace-mobile.json`, `workspaces.json`).

## Layout

| Path | Read by | Written by |
|---|---|---|
| `features/<slug>.md` | everyone | section-by-section per writer-ownership table |
| `features/_template.md` | `/new-feature` | rarely |
| `kanban/company.md` | everyone | dispatcher only |
| `kanban/engineering.md` | everyone | tech-lead only |
| `kanban/design.md` | everyone | design-lead only |
| `kanban/marketing.md` | everyone | marketing-lead only |
| `log/YYYY-MM-DD.md` | everyone | append-only by anyone |
| `log/standups/YYYY-WW.md` | everyone | `/standup` |
| `teams/<team>.md` | the team | that team's lead |
| `standards/design-system.md` | design + frontend + content | design-lead |
| `standards/engineering-standards.md` | all of engineering | tech-lead |
| `standards/marketing-standards.md` | marketing + content + SEO | marketing-lead |
| `protocols/dispatch.md` | every agent before delegating | rare; protocol changes |
| `plans/PHASE_*.md` | when relevant | rare; phase planning |

## How to start a feature

```
/new-feature <slug>           # scaffolds the file + Backlog card
# edit the Problem / Acceptance criteria sections
/dispatch <slug>              # routes through the agent teams
```

See `protocols/dispatch.md` for the full handoff contract.
