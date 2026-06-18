---
type: agent-index
---

# Agent Roles

These stub pages let Obsidian navigate between agent roles. The full role definitions (system prompts, tool lists, loop steps) live in `.claude/agents/` outside the vault and are not Obsidian-navigable directly.

All work flows through [[agents/dispatcher]]. Humans never invoke an IC directly — see [[protocols/dispatch]] for the handoff contract.

## Org chart

| Role | Team | Owns |
|---|---|---|
| [[agents/dispatcher]] | company | [[kanban/company]], feature `status` frontmatter |
| [[agents/tech-lead]] | engineering | [[kanban/engineering]], [[standards/engineering-standards]] |
| [[agents/backend-dev]] | engineering | `### Backend` subsection |
| [[agents/frontend-dev]] | engineering | `### Frontend` subsection |
| [[agents/qa-engineer]] | engineering | `### Test plan` subsection |
| [[agents/code-reviewer]] | engineering | `### Code review` subsection |
| [[agents/e2e-test-writer]] | engineering | `### E2E coverage` subsection |
| [[agents/mobile-dev]] | engineering | `### Mobile` subsection (dormant until Phase 4) |
| [[agents/design-lead]] | design | [[kanban/design]], [[standards/design-system]] |
| [[agents/ui-designer]] | design | `### Visual` subsection |
| [[agents/ux-writer]] | design | `### Microcopy` subsection |
| [[agents/a11y-auditor]] | design | `### Accessibility` subsection |
| [[agents/marketing-lead]] | marketing | [[kanban/marketing]], [[standards/marketing-standards]] |
| [[agents/content-writer]] | marketing | `### Launch copy` subsection |
| [[agents/seo-specialist]] | marketing | `### SEO` subsection |
| [[agents/growth-analyst]] | marketing | `### Growth` subsection |

## Related

- [[README]] — vault layout and how to start a feature
- [[protocols/dispatch]] — full handoff contract
- [[teams/engineering]] · [[teams/design]] · [[teams/marketing]] — team charters
