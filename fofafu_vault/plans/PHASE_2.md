---
phase: 2
status: drafting
started: 2026-06-03
shipped: null
---

# Phase 2 — Backend port + the Claude-powered reply coach

## Theme

Phase 2's original charter — "port the backend feature-by-feature" — is **already complete**. `auth-email`, `announcements-feed`, `family-profiles`, `messaging-dms`, and `community-search` all shipped through the dispatcher and sit in `Done` on both the engineering and company kanbans. That clears the runway for what Phase 2's closing move now becomes: fofafu's first AI-assisted feature — a **trauma-informed reply coach** built on the Claude API. The coach is the differentiator that distinguishes fofafu from the original fofa — same product surface, smarter conversational floor.

## Why a reply coach (and not the other candidates)

Foster-family threads carry weight other community feeds don't. A well-meaning comment ("at least you got to keep her", "real parents", "lucky kid", "you're a saint") can re-traumatize a foster parent, bio family member, or former-foster-youth reading the thread. Moderation-after-the-fact doesn't help; the harm has already been read.

Three Claude-API features were considered:

| Candidate | Why considered | Why not first |
|---|---|---|
| **Reply coach** | Pre-publish nudge against harmful phrasings, with a gentler rewrite the author can accept or dismiss. Pure language nuance — Claude's strength. | — *(chosen)* |
| Privacy-aware post helper | Flags identifying details (school names, court dates, bio-family names) in announcement drafts. | Overlaps with what a regex + wordlist can do; weaker showcase for the model. Revisit in Phase 3 once the coach plumbing exists. |
| Family activity digest | Weekly Claude-written summary of a family's posts for new community members. | Nice-to-have, lower urgency, depends on having enough post volume to summarize. Defer. |

The coach wins on **uniqueness**, **scoped surface area**, and **clarity of value to the foster audience**.

## Scope

### Already shipped (the original Phase 2 charter)

The five backend ports are all in `Done`:

- `auth-email` — first port; node:test 9/9
- `announcements-feed` — posts + comments + reactions; 11/11 feature tests
- `family-profiles` — auto-create on register; 23/23 backend tests
- `messaging-dms` — DMs + unread counts; 7/7 feature tests
- `community-search` — `GET /api/search/families`; 53/53 backend

These are listed here for the retro narrative, not as remaining work.

### In scope (closing Phase 2)

1. **Reply coach feature** (new):
   - Feature file: `fofafu_vault/features/reply-coach.md` *(scaffolded 2026-06-03)*
   - Backend: `POST /api/comments/coach` — accepts a draft comment + thread context, returns `{ verdict: "ok" | "suggest", reasoning: string, rewrite?: string, categories?: string[] }`
   - Anthropic SDK integration with **prompt caching** on the system prompt (warmth/voice rules + foster-context anti-patterns) — keeps cost down on hot paths
   - Server-side rate limiting per user (coach calls are cheap individually, expensive in aggregate)
   - Feature flag (`reply_coach_enabled`) so it can be dark-launched and A/B'd by growth
2. **Engineering hardening that the coach forces**:
   - Settings schema for `ANTHROPIC_API_KEY` (env-only, never committed)
   - Request/response logging with PII scrubbing — coach inputs ARE user content; we don't store them post-call
   - Error budget + graceful degradation: if the Claude call fails, the composer still publishes (the coach is advisory, never a gate)

### Out of scope (deferred)

- Frontend implementation of the coach UI — Phase 3 owns this. The backend exposes the endpoint; the composer chip lands in the React port.
- Privacy-aware post helper, family digest — listed above.
- Mobile — Phase 4.
- Model fine-tuning. Prompt engineering only.

## The reply coach — design notes

### Contract

```
POST /api/comments/coach
Authorization: Bearer <session>
Content-Type: application/json

{
  "draft": string,          // the comment the user is about to publish
  "threadContext": {        // optional but recommended
    "postTitle": string,
    "recentComments": Array<{ author: string, body: string }>  // last 3, sanitized
  }
}

200 OK
{
  "verdict": "ok" | "suggest",
  "categories": string[],   // e.g. ["minimization", "savior-framing"] — empty when verdict=ok
  "reasoning": string,      // one-sentence explanation shown only if user expands
  "rewrite": string | null  // present when verdict=suggest
}
```

### Voice + behavior

- Coach is **advisory, never blocking**. The composer always lets the user publish their original draft.
- Coach is **silent on neutral comments**. `verdict=ok` returns nothing visible to the user; no banner, no green check.
- Coach speaks **warmly, briefly, and never lectures**. Voice rules live in `fofafu_vault/standards/design-system.md` and are extended for this feature in the spec.
- Coach **does not moderate opinions** — it flags phrasings known to land badly in foster contexts, not viewpoints.

### Categories it watches for (initial list — refined during spec phase)

- Minimization ("at least…", "could be worse")
- Savior framing ("you're a saint", "such a hero")
- Bio-family othering ("real parents", "her actual mom")
- Permanence assumptions ("forever family" when placement is uncertain)
- Unsolicited diagnosis ("sounds like RAD/FASD/autism")
- Public identifying details (school names, court dates, full bio names)

### Caching strategy

- The system prompt is large (voice rules + category descriptions + few-shot examples) and stable.
- Use Anthropic prompt caching with a 5-minute TTL on the system block.
- Expected hit rate at steady state: >90% on busy threads, since multiple users coach drafts within the same window.

### Cost guardrails

- Per-user rate limit: 60 coach calls per hour (a heavy commenter ceiling).
- Per-call max output tokens: 200 (rewrite is short by design).
- Daily cost cap surfaced via the growth-analyst's metric.

## Sequencing

| Sub-phase | What | State |
|---|---|---|
| 2a | `/dispatch auth-email` | ✅ shipped |
| 2b | `/dispatch announcements-feed` | ✅ shipped |
| 2c | `/dispatch family-profiles` | ✅ shipped |
| 2d | `/dispatch messaging-dms` | ✅ shipped |
| 2e | `/dispatch community-search` | ✅ shipped |
| 2f | `/new-feature reply-coach` → `/dispatch reply-coach` | feature file scaffolded 2026-06-03; dispatch pending |
| 2g | Phase 2 retro into `fofafu_vault/log/standups/` | pending — runs after 2f ships |

2f is the only remaining build sub-phase. It depends on the announcements feed (2b) for end-to-end testing against real comment shapes, which is already in place.

## Risks and how we'll handle them

| Risk | Mitigation |
|---|---|
| Coach gives bad advice and erodes trust | Strict voice rules in the system prompt; small allowed category set; refuse-rather-than-guess instruction; design-lead audits sample outputs before flag flips to default-on. |
| Latency makes the composer feel slow | Coach is fire-and-forget on the client side (debounced, runs in background, surfaces when ready). Backend SLO p95 < 1.5s; over that we drop the suggestion silently. |
| Cost runs away | Prompt caching + per-user rate limit + daily cap. Growth-analyst's success metric explicitly tracks cost-per-active-author. |
| Coach inputs leak to logs | Strict PII scrub at the log boundary; coach payloads are NOT persisted beyond the in-memory request. Documented in the backend spec. |
| API key handling | `ANTHROPIC_API_KEY` env-only. Backend refuses to boot if absent and the flag is on. Never logged. |
| Feature-flag misuse | `reply_coach_enabled` defaults `false` in production until the design-lead signs off on sample outputs. |

## Exit criteria for Phase 2

- ✅ All five backend feature ports merged, tested, and visible on the engineering kanban in `Done`.
- `fofafu_vault/features/reply-coach.md` is `shipped`; coach endpoint live behind the flag; sample-output review documented in the feature spec's `### Test plan`.
- Anthropic key handling, rate limiting, and prompt-caching configuration are documented in `backend/README.md`.
- Growth-analyst has recorded the baseline metric (calls/day, cache hit rate, cost/day, suggestion-acceptance rate) in the feature spec's `### Growth` section.
- Phase 2 retro written into the standup log for the closing week.

## Verification (manual, run as features land)

- `npm run -w backend test` green after each sub-phase.
- `curl -X POST .../api/comments/coach` returns shape above for at least 3 hand-crafted drafts: one neutral (`verdict=ok`), one minimization, one savior-framing.
- Prompt-cache hit rate > 80% on a synthetic 10-call burst within 60 seconds (read from response headers).
- Kanban discipline: every feature visibly transits Backlog → In Progress → Review → Done. No straight-to-Done jumps.

## What each team does in Phase 2

| Team | Work |
|---|---|
| Engineering | Backend ports + the coach endpoint, tests, key handling, rate limiting, prompt caching, error budget. |
| Design | Voice rules for the coach (extending the team charter); sample-output audit before the flag flips on; microcopy for the (future) composer chip so Phase 3 can wire it directly. |
| Marketing | Launch copy for the coach (release note + landing block); SEO unaffected (the coach is auth-walled); growth-analyst owns the metric + flag. |

## Open questions to resolve during spec

- Do we coach DMs as well, or only public announcement comments in v1? *Lean: public only at first — DMs are private and the consent model is different.*
- Do we show the user **why** a phrase was flagged, or just offer the rewrite? *Lean: rewrite-first, "why" available on expand. Less lecture-y.*
- How do we measure success? *Initial proposal: suggestion-acceptance rate + reported-comment rate before vs after launch among flagged users. Growth-analyst to finalize.*
