---
phase: 1
status: shipped
started: 2026-05-15
shipped: 2026-05-15
---

# Phase 1 — Bootstrap (shipped 2026-05-15)

## Scope (delivered)

1. ✅ Repo skeleton: `package.json` (workspaces `backend`, `frontend`), `tsconfig.base.json`, `.gitignore`, `README.md`, `CLAUDE.md`.
2. ✅ `.claude/` agent company: dispatcher + 4 engineering + 4 design + 4 marketing (mobile-dev included but dormant until Phase 4). 13 files total.
3. ✅ `.claude/commands/`: `dispatch`, `new-feature`, `standup`, `sanity-check`.
4. ✅ `.claude/settings.json` with permission allowlist + hook stubs documenting the sanity-check cadences. Real schedules deferred to `/schedule` post-Phase-1 once we have measured runtimes.
5. ✅ `fofafu_vault/` tree: `.obsidian/community-plugins.json` enabling `obsidian-kanban`; 4 kanban boards; team charters for eng / design / marketing; `_template.md` feature file; daily log file; protocols/dispatch.md handoff spec.
6. ✅ Dispatcher fully wired end-to-end with working team handoffs: writer-ownership table, status state machine, retry/escalation rules, prompt template, kanban transitions all specified in `fofafu_vault/protocols/dispatch.md`.
7. ✅ Worked example: `fofafu_vault/features/user-profile.md` flowed through engineering -> design -> marketing with matching kanban state (all four boards show it in Done) and a complete handoff trail in `fofafu_vault/log/2026-05-15.md`.
8. ✅ Git committed.

## Key decisions

- **Writer ownership > locking.** Each file has exactly one writer per turn. This avoids any need for distributed coordination and means agents can run in parallel.
- **Vault fully in git, including logs and standups.** Trade-off: more commits, but the project history is shared verbatim across collaborators. No separate database.
- **Obsidian Kanban plugin not vendored.** First-run docs say "Install via Community plugins". Cost: one click. Benefit: smaller repo, no plugin-update drift.
- **`mobile-dev` agent exists but dormant.** Defining the role now means Phase 4 doesn't have to retrofit; the dispatcher will simply not classify into mobile until the flag flips.
- **Phase 1 ships specs, not code.** The worked example `user-profile` has every team's section filled but no backend/frontend code — that's Phase 2/3.

## Risks called out at start (and how they landed)

| Risk | Mitigation | How it landed |
|---|---|---|
| Multiple agents writing the same kanban file | Writer-ownership table; only the team's lead edits the team's board | Encoded in CLAUDE.md and dispatch.md §3. |
| Dispatcher -> lead loops if leads spawn the dispatcher | Protocol §11: "do not re-prompt yourself" | Documented; needs runtime sanity-check in Phase 2. |
| Hooks running before dispatcher is sound | Ship hook intent stubs; real schedules added after Phase 2 | Done — `.claude/settings.json` lists cadences as `_scheduled_sanity_checks` (intent only). |
| Vault commit churn | Single `vault:` Conventional Commit prefix; standup batches the week | Documented in CLAUDE.md and team charters. |

## Sequencing

- Phase 1 (this) -> ships dispatcher + protocols + worked example. **Done.**
- Phase 2 -> port backend, feature-by-feature through the dispatcher. First feature: `auth-email` (the dependency wall for everything else).
- Phase 3 -> port frontend. First feature: `auth-pages` consuming Phase 2 backend.
- Phase 4 -> mobile-dev wakes up; Expo + RN; share API client with frontend.

## Verification (run after this commit)

- `ls -R /Users/reikurata/dev/fofafu/.claude/agents/` -> 13 agent files in correct subdirs.
- `ls -R /Users/reikurata/dev/fofafu/fofafu_vault/` -> full tree.
- Open `fofafu_vault/` in Obsidian -> install Kanban plugin -> `kanban/company.md` renders as a board with `user-profile` in `Done`. *(Manual; run after first clone.)*
- Open a fresh Claude Code session at `/Users/reikurata/dev/fofafu` and verify CLAUDE.md auto-loads. *(Manual.)*
- Run `/new-feature auth-email` -> should create `fofafu_vault/features/auth-email.md` and Backlog cards. *(Phase 2 starting move.)*

## What each team does in each phase

| Phase | Engineering | Design | Marketing |
|---|---|---|---|
| 1 (shipped) | charter, agent defs, worked-example backend/frontend/QA specs | charter, token system v0, Figma reference canonised, worked-example design spec | charter, voice rules, worked-example launch copy + SEO + growth |
| 2 | port backend feature-by-feature; tests with implementation | design QA on any new component-shaped surface; token additions as needed | release-note draft per feature; SEO meta per public route |
| 3 | port frontend feature-by-feature | wire token system into Tailwind config; a11y audits per page | landing page + per-feature growth metrics live |
| 4 | wake mobile-dev; share API client | mobile token mapping; touch-target audit | launch the mobile beta; app-store metadata |
