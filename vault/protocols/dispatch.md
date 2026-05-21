# Dispatch Protocol — the handoff contract

Every agent in this project reads this file before delegating. It defines the file conventions, status transitions, and retry/escalation rules that keep multi-agent work consistent.

## 1. Entry point

Humans invoke `/dispatch <feature-link>`. Examples:

- `/dispatch [[features/user-profile]]`
- `/dispatch user-profile` (the dispatcher resolves the slug to `vault/features/user-profile.md`)

The dispatcher is the **only** entry point. ICs are never invoked directly.

## 2. The dispatcher's loop

```
1. resolve(feature) → read vault/features/<slug>.md
2. classify(feature) → set([engineering, design, marketing])  ⊆ frontmatter.owner ∪ collaborators
3. for each team in classification:
     move kanban/company.md card to "In Progress"
     decompose the team's work into 1–3 specialist tasks
4. spawn ALL specialists in parallel — one Agent call block, multiple tool
   invocations, across every classified team. Each gets prompt 5a below.
5. await all specialist returns
6. for each team in classification:
     spawn Agent(<team>-lead, prompt=5b) — lead audits the specialist
     subsections, moves its team kanban card to Review, returns
7. await all team-lead aggregator returns
8. aggregate(lead returns) → update kanban/company.md, update feature.frontmatter.status
9. append vault/log/<today>.md entry summarising routing + results
```

The dispatcher itself never touches a team's kanban — only `company.md` and feature `status`.

### Why the dispatcher fans out to specialists directly

The Claude Code harness flattens the spawn hierarchy: a top-level session can spawn subagents, but those subagents cannot spawn further subagents (the `Agent` tool is not propagated to subagent sessions even when the role file declares it). The protocol therefore runs in 2 levels — dispatcher → specialist — with the team-lead serving as an aggregator after the fact instead of as a spawner before. Lead role files keep `Agent` in their tool list for forward-compatibility; if the harness ever supports nested spawn, the protocol can be revised to A-shape (lead spawns specialists) without breaking the role-file contract.

## 3. Team-lead's loop (aggregator-only)

A team-lead is spawned by the dispatcher AFTER its specialists have already returned:

```
1. read .claude/agents/<team>/<lead>.md (own role)
2. read vault/teams/<team>.md            (charter, conventions)
3. read vault/protocols/dispatch.md      (this file)
4. read vault/features/<slug>.md         (specialist subsections already written)
5. audit the specialist subsections for completeness, mutual consistency, basic quality
6. light editorial consolidation if needed; do NOT rewrite the specialists' work
7. move kanban/<team>.md card from "In Progress" to "Review"
8. append a single roll-up log entry
9. return {team, status, requested_status, deliverables, notes, test_summary}
```

Team-leads own their team's kanban. They do not spawn specialists (the dispatcher does). They do not write code (specialists do).

## 4. Specialist's loop

```
1. read .claude/agents/<team>/<role>.md
2. read vault/protocols/dispatch.md
3. read vault/features/<slug>.md
4. (optional) move kanban/<team>.md card from "Backlog" to "In Progress" if no
   card is there yet — the lead will move it to Review later. Normally the
   dispatcher has already created the In Progress entry implicitly via the
   spawn; this step is a safety net.
5. do the work (write code / copy / design tokens / tests)
6. write your subsection into vault/features/<slug>.md (### Backend, ### Frontend,
   ### Visual, ### Microcopy, etc.) — only the section you own
7. append a log entry to vault/log/<today>.md
8. return {role, status, deliverable, test_summary, notes}
```

### Cross-specialist coordination

When specialists run in parallel and share a contract (e.g. backend DTO shape consumed by frontend), the dispatcher's prompt must name the contract explicitly and tell each specialist to read the other's committed/uncommitted code before finalising schemas. If shapes drift, the consumer adapts to the producer and notes it in `notes`.

## 5. Prompt templates

### 5a. Dispatcher → specialist

```
You are <role>. Today is <YYYY-MM-DD>.

Feature: vault/features/<slug>.md
Your task scope: <one sentence from the dispatcher's decomposition>

You're being spawned by the dispatcher (not your team-lead) because the
Claude Code harness does not propagate the Agent tool into subagent sessions.
Your team-lead will audit and aggregate your work AFTER you return.

Required reads:
1. .claude/agents/<team>/<role>.md
2. vault/protocols/dispatch.md
3. vault/features/<slug>.md

Writer ownership (only edit what you own):
<copied from CLAUDE.md Writer-ownership table for this role>

Coordinate with: <list of sibling specialists running in parallel + shared
contract fields if any>

Deliverables: <comma-separated list>

Quality gates: <test commands, tsc, build — whatever applies>

Return a structured block:
{ role, status, deliverable, test_summary, notes }
```

### 5b. Dispatcher → lead (aggregator)

```
You are <team>-lead. Today is <YYYY-MM-DD>.

Feature: vault/features/<slug>.md
Slug: <slug>

The specialists have already returned. Their subsections are already written
into the feature spec. You are NOT being asked to spawn anyone or write code.

Your duties:
1. Audit your team's subsections of the feature spec.
2. Move the kanban/<team>.md card from In Progress to Review.
3. Append one roll-up log entry.
4. Return the structured block.

Required reads:
1. vault/features/<slug>.md (focus on your team's section)
2. vault/kanban/<team>.md (confirm card is in In Progress)
3. vault/log/<today>.md (confirm specialist entries exist)

Writer ownership:
<copied from CLAUDE.md>

Return:
{ team, status, requested_status, deliverables, notes, test_summary }
```

## 6. Status state machine

```
drafting → speced → building → review → shipped
   │          │         │         │
   ▼          ▼         ▼         ▼
       blocked / abandoned   (off-ramps; reachable from any pre-terminal state)
```

| From | To | Trigger | Writer |
|---|---|---|---|
| drafting | speced | tech-lead accepts the spec (acceptance criteria filled) | dispatcher (on lead's `requested_status: speced`) |
| speced | building | dispatcher dispatches the feature | dispatcher |
| building | review | all team-leads return `status: success` | dispatcher |
| review | shipped | human approves OR `/dispatch <slug> --ship` invoked | dispatcher |
| any | blocked | any agent returns `status: failed` after retry | dispatcher |
| any | abandoned | human writes `requested_status: abandoned` in feature file | dispatcher |

## 7. Kanban transitions

| Feature status | Card lives on team boards | Card lives on company board |
|---|---|---|
| drafting | nowhere (not yet routed) | `Backlog` |
| speced | nowhere (not yet routed) | `Backlog` |
| building | `In Progress` on each owning team's board | `In Progress` |
| review | `Review` on each owning team's board | `Review` |
| shipped | `Done` on each owning team's board | `Done` |
| blocked | `Blocked` on each owning team's board (or wherever the failure happened) | `Blocked` |
| abandoned | removed from all team boards | bottom of `Done` with `~~strikethrough~~` |

## 8. Retry & escalation

```
specialist returns status=failed
   → dispatcher retries that specialist ONCE with a more constrained prompt
       → still failing?
           → dispatcher moves card to "Blocked" on company.md
           → dispatcher appends log entry tagged #escalation
           → dispatcher sets feature.frontmatter.status = blocked
           → human is now expected to intervene (surfaced in next /standup)

team-lead aggregator returns status=failed
   → dispatcher retries the lead ONCE with a more constrained prompt (typically
     pointing to a specific subsection that needs cleanup)
       → still failing?
           → dispatcher proceeds with manual aggregation, sets status=review
             with a #manual-aggregation log tag, and surfaces the failure in
             the lead's notes for the next /standup
```

Retry is bounded: **one** retry per spawn. Don't loop. Don't recurse. Don't widen scope on retry — narrow it.

## 9. Log entry format

Append-only. Never edit existing lines. Today's file is `vault/log/<YYYY-MM-DD>.md`. Under the 2-level model, a typical dispatch produces this sequence:

```
- 14:32 #team/dispatch [[features/user-profile]] — routed to engineering, design, marketing; spawning specialists in parallel
- 14:35 #team/eng/backend [[features/user-profile]] — drafted GET /api/users/:id; +4 tests; 64/64 pass
- 14:36 #team/eng/frontend [[features/user-profile]] — UserCard + ProfileEdit; +3 tests; 42/42 pass; tsc/vite clean
- 14:37 #team/eng/qa [[features/user-profile]] — test plan + sweep; backend 68/68, frontend 45/45
- 14:38 #team/design/ui [[features/user-profile]] — wireframes + token references in feature spec
- 14:39 #team/design/uxw [[features/user-profile]] — microcopy table (12 strings)
- 14:40 #team/design/a11y [[features/user-profile]] — keyboard + contrast + ARIA audit clean
- 14:42 #team/marketing/content [[features/user-profile]] — release-note draft + landing block
- 14:45 #team/eng [[features/user-profile]] — tech-lead aggregated; engineering kanban In Progress -> Review
- 14:46 #team/design [[features/user-profile]] — design-lead aggregated; design kanban In Progress -> Review
- 14:46 #team/marketing [[features/user-profile]] — marketing-lead aggregated; marketing kanban In Progress -> Review
- 14:47 #team/dispatch [[features/user-profile]] — all teams returned success; status building -> review; company kanban In Progress -> Review
```

`HH:MM` is 24-hour local time. Tag namespace: `#team/<eng|design|marketing|dispatch>` with optional sub-tag `/<role>`. Feature link wikilink. Em-dash, then message.

## 10. Standup format

Weekly file: `vault/log/standups/<YYYY-WW>.md` (ISO week). Sections:

```markdown
# Standup — Week W of YYYY (YYYY-MM-DD → YYYY-MM-DD)

## Engineering
- Shipped: [[features/foo]], [[features/bar]]
- In flight: [[features/baz]]
- Blocked: <list with reasons>

## Design
...

## Marketing
...

## Cross-cutting
- <escalations, decisions needed, themes>
```

Built by aggregating that week's `log/*.md` files and current kanban state.

## 11. Things you may NOT do

- (dispatcher) Skip the lead-aggregator spawn — the lead still owns the team kanban move and the audit, even though it no longer spawns specialists. Spawning a lead solely to move a kanban card is fine; that's its job under the 2-level model.
- (lead) Spawn specialists yourself — the dispatcher does that. If the harness ever supports nested spawn and §2 is revised to A-shape, this restriction lifts.
- (specialist) Talk to another team's specialist directly. Cross-team contracts are coordinated through your dispatcher prompt (per §4 "Cross-specialist coordination"); cross-team disagreements escalate via your `notes` field.
- (anyone) Edit a file outside your writer-ownership.
- (anyone) Rename or delete a feature file (mark `status: abandoned` instead).
- (anyone) Skip the log entry on completion.
- Re-prompt yourself in a loop — the protocol is bounded by design.
