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
     spawn Agent(<team>-lead, prompt=PROMPT_TEMPLATE(feature, role="lead"))
4. await all team-lead returns
5. aggregate(returns) → update kanban/company.md, update feature.frontmatter.status
6. append vault/log/<today>.md entry summarising routing + results
```

The dispatcher itself never touches a team's kanban — only `company.md` and feature `status`.

## 3. Team-lead's loop

A team-lead, when spawned by the dispatcher:

```
1. read .claude/agents/<team>/<lead>.md (own role)
2. read vault/teams/<team>.md            (charter, conventions)
3. read vault/protocols/dispatch.md      (this file)
4. read vault/features/<slug>.md         (the work)
5. decompose into specialist tasks
6. move kanban/<team>.md card to "In Progress"
7. for each specialist task:
     spawn Agent(<specialist>, prompt=PROMPT_TEMPLATE(feature, role=<specialist>))
8. await all specialist returns
9. write specialist outputs into the appropriate section of vault/features/<slug>.md
10. move kanban/<team>.md card to "Review"
11. append a single roll-up log entry
12. return {team, summary, status: success | partial | failed, requested_status: <enum>}
```

Team-leads own their team's kanban. Specialists never touch the kanban.

## 4. Specialist's loop

```
1. read .claude/agents/<team>/<role>.md
2. read vault/features/<slug>.md
3. do the work (write code / copy / design tokens / etc.)
4. append a log entry to vault/log/<today>.md
5. return {role, deliverable, status: success | failed, notes}
```

## 5. Prompt template (used by dispatcher → lead and lead → specialist)

```
You are <role>. Today is <YYYY-MM-DD>.

Feature: vault/features/<slug>.md
Your task scope: <one sentence from classification step>

Required reads:
1. .claude/agents/<team>/<role>.md
2. vault/teams/<team>.md       (skip if specialist)
3. vault/protocols/dispatch.md
4. vault/features/<slug>.md

Writer ownership (only edit what you own):
<copied from CLAUDE.md Writer-ownership table for this role>

Deliverables: <comma-separated list>

Return a structured JSON-like block:
{ role, status, deliverable, notes, requested_status (if lead) }
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
   → lead retries ONCE with a more constrained prompt
       → still failing?
           → lead returns status=partial, includes failure reason in notes
              → dispatcher moves card to "Blocked" on company.md
              → dispatcher appends log entry tagged #escalation
              → dispatcher sets feature.frontmatter.status = blocked
              → human is now expected to intervene (mentioned in next /standup)
```

Retry is bounded: **one** retry per spawn level. Don't loop. Don't recurse. Don't widen scope on retry — narrow it.

## 9. Log entry format

Append-only. Never edit existing lines. Today's file is `vault/log/<YYYY-MM-DD>.md`. Lines look like:

```
- 14:32 #team/dispatch [[features/user-profile]] — routed to engineering, design, marketing
- 14:33 #team/eng [[features/user-profile]] — tech-lead acknowledged, decomposing
- 14:35 #team/eng/backend [[features/user-profile]] — drafted GET /api/users/:id spec
- 14:36 #team/design [[features/user-profile]] — ui-designer producing wireframes
- 14:42 #team/marketing [[features/user-profile]] — content-writer drafted profile-card microcopy
- 14:47 #team/dispatch [[features/user-profile]] — all teams returned success, moved to Review
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

- Spawn an IC without going through their lead (except inside the lead's own decomposition).
- Edit a file outside your writer-ownership.
- Rename or delete a feature file (mark `status: abandoned` instead).
- Skip the log entry on completion.
- Re-prompt yourself in a loop — the protocol is bounded by design.
