---
slug: comment-classification-pipeline
title: Comment Classification Pipeline
owner: engineering
collaborators: [design]
status: drafting
priority: P2
created: 2026-10-24
target: null
links:
  kanban: "[[kanban/engineering]]"
  designs: null
  parent: "[[features/reply-coach-live]]"
---

# Comment Classification Pipeline

## Problem

[[features/reply-coach]] runs one Claude call on a draft comment and only nudges on tone. It cannot tell a question from an update from a venting post, so it applies the same check to all of them. It also has no safeguard for foster-care confidentiality (a child's name, case details, photos) and no way to stop a comment that is clearly unsafe. Success means every draft is classified before publish and gets the guardrail that fits its category. The coach nudges first. If the author posts without changing the flagged text, the comment is blocked.

## Design decisions (settled 2026-10-24)

- **Prompt chaining, not an agent loop and not MCP.** The category list is fixed and each category maps to a fixed handler. Routing is a plain `switch` in code, not an LLM decision.
- **Tool calling is the structured-output mechanism** for each stage, with `tool_choice: auto` plus strict tool schemas (or structured outputs). Forced `tool_choice` is not accepted on the newer models (see [[features/coach-verdict-tool]] out-of-scope note).
- **Runs before publish.** Coach-first: the first flag is a nudge in the composer. If the author submits again without changing the flagged text, the post is blocked.
- **`question` means anything a user wants to ask the community.** No topic restriction and no curated source set, so a question is never refused for being off-topic. In v1 the `question` handler is moderation only; source references are a follow-up feature (see Out of scope).
- **Hard block, edit-only.** A blocked draft has no override and no appeal in v1. The author must change the flagged text.
- **Enforced server-side.** `POST /announcement/:id/comments` is where comments are inserted, so the block is enforced there, not only in the composer. `/coach` returns a short-lived signed verdict token (HMAC over user id, hash of the normalized draft, verdict, expiry). The comment POST verifies the token instead of calling the model again, so the nudge and the block can never disagree. A POST with no valid token runs the pipeline itself (fail-open on model error).
- **Models (settled 2026-10-26):** `claude-haiku-5-5` for classify and moderation; a flagged-as-blocking or low-confidence verdict gets a second opinion from `claude-sonnet-5-5` before it can block, because a hard block makes false positives costly.
- **Home (settled 2026-10-26):** the pipeline lives in a new shared module under `supabase/functions/_shared/`, used by both `coach` (nudge) and `announcement` (enforce). No new edge function.
- **Fail-open on model errors.** A classifier outage, timeout, refusal, or invalid output never blocks a post. Only the deterministic pre-checks and a completed model verdict can block.

## Pipeline

```
draft
 ├─ 0. deterministic pre-checks (PII regex, length, blocklist) — no LLM
 ├─ 1. classify (small model, tool → schema)
 │     category: question | update | support | celebration | crisis | other
 │     flags: pii, child_identifying, medical_legal_advice, hostile
 │     confidence
 ├─ 2. route (switch)
 │     question → source references (allowlisted ids only)
 │     update   → privacy guardrail
 │     support  → existing reply-coach tone check
 │     crisis   → resources + admin flag
 │     other    → moderation only
 └─ 3. moderation filter (all categories) → verdict
```

## Acceptance criteria

- [ ] Stage 1 classifier returns `{category, flags, confidence}` through a tool whose `input_schema` is validated with Zod; `tool_choice` is `auto` and a missing or invalid tool call is treated as a failure, not parsed from text.
- [ ] Every draft is classified before publish; the composer shows the nudge on the first flagged submit.
- [ ] A second submit with the flagged text unchanged is blocked with a clear, warm message (copy owned by ux-writer). Editing the flagged text clears the block and re-runs the check.
- [ ] The block is enforced in `POST /announcement/:id/comments` via the signed verdict token; a direct API call with flagged text is rejected the same way as the composer.
- [ ] `update` drafts are checked for child-identifying information and case details; `support` drafts reuse the existing coach tone check.
- [ ] A `crisis` classification shows support resources and flags the comment for an admin; it is not silently blocked.
- [ ] Moderation filter runs on every category.
- [ ] Any model failure falls back to publishing, logs a categorized error (reuse `CoachErrorCategory`), and is covered by tests.
- [ ] Per-stage feature flag and cost cap, reusing the coach's flag/cap mechanics.
- [ ] Fixture-based test suite for classification and for each handler, written before implementation.

## Out of scope

- Source references for `question` drafts (follow-up feature; with open-ended questions there is no curated set yet, and model-generated URLs are never shown).
- Override or appeal flow for blocked drafts.
- After-publish auto-hiding (stays out of scope in [[features/moderation-report-block]]).
- An MCP server or an agent loop for the `question` handler.
- Admin queue UI for flagged `crisis` comments (the data lands; the UI is separate).
- Direct messages. Comments only in v1.

## Open questions

- ~~Curated source set for `question`~~ **Resolved (2026-10-24):** questions are open-ended, no curated set. References are deferred.
- ~~Block UX~~ **Resolved (2026-10-24):** hard block, edit-only.
- ~~Slicing~~ **Resolved (2026-10-24):** slice 1 = stage 0 pre-checks + stage 1 classifier + coach-first/block-on-unchanged; each category handler is a later feature.
- ~~Model per stage~~ **Resolved (2026-10-26):** Haiku 5.5 with a Sonnet 5.5 second opinion before a block. The coach still pins `claude-3-5-haiku-20241022`; moving it is a separate chore.
- ~~Home~~ **Resolved (2026-10-26):** shared module in `supabase/functions/_shared/`, used by `coach` and `announcement`.
- Rate limit, cost cap and holdback state in `coach` are per-isolate memory, so the cost cap is only approximate. Acceptable for slice 1, or does it need a table first?

<!-- The sections below are written by team-leads during dispatch. -->

## Engineering — Acceptance

### Backend
*(filled by backend-dev)*

### Frontend
*(filled by frontend-dev)*

### Test plan
*(filled by qa-engineer)*

### E2E coverage
*(filled by e2e-test-writer; "No E2E coverage" if the feature is backend-only)*

### Code review
*(filled by code-reviewer; populated during building → review, not at speccing time)*

## Design — Spec

### Visual
*(filled by ui-designer)*

### Microcopy

Spec pass, 2026-10-26. Scope is slice 1: nudge, block, crisis, checking, error and screen-reader strings for the comment composer. Strings sit beside the shipped [[features/reply-coach]] `### Microcopy` (Part 3, `coach.*` keys) and use the same platform "we" voice. Nothing here edits `coach.*` keys.

Conventions for this table:

- `max` is a character cap for the UI slot, set about 10% above the written string. If a string does not fit, flag it to the ux-writer; do not truncate.
- `{{...}}` marks a placeholder that must be replaced by the product owner. Nothing in this table is a real hotline, number or URL.
- No string quotes, paraphrases or names any part of the author's draft. Screen-reader announcements included.
- Every string is written to be reviewed alone, so some sentences repeat across flags on purpose.

#### Where the strings render

| surface | file | note |
|---|---|---|
| Nudge, block and crisis panels | new component beside `CoachChip/` inside `CommentForm.tsx`, below the textarea | One panel at a time. Recommended: a pipeline panel replaces the `CoachChip` for the same draft, so the composer never shows two competing messages. Confirm with ui-designer. |
| Submit button | `CommentForm.tsx` (today: `Comment`, and `Posting…` while pending) | The label is `Comment`, not `Post`. These strings use the shipped label. |
| Network and server errors | `CommentForm.tsx` `serverError` slot (today: `Could not post.`) | Replaced by the two error strings below. |

#### 1. Nudge (first flagged submit)

Panel structure: eyebrow, one body string for the flag, then the consequence line. No buttons. The author changes the text in the textarea, which clears the panel and re-checks. There is deliberately no dismiss control, because dismissing would change nothing and would imply an override that does not exist.

| id | context | string | max | notes |
|---|---|---|---|---|
| `pipeline.nudge.eyebrow` | Mono kicker above every nudge body | A note before you post | 32 | Same slot and style as `coach.suggest.preface` (`One way to say it:`). No colon, because it introduces a paragraph, not a rewrite. |
| `pipeline.nudge.pii.body` | Flag `pii`: phone, address, email | This may include a phone number, address, or email. Contact details are safer in a direct message. Could you take them out of the comment? | 180 | "May include" because the classifier can be wrong. Points to DMs as the useful alternative, so the author is not just told no. |
| `pipeline.nudge.child_identifying.body` | Flag `child_identifying`: child's name, school, photo, case details, birth-family details | This may include details that could point to a child, like a name, school, photo, case details, or birth-family information. Could you keep it more general? Keeping those details private protects them. | 210 | Lists the concrete things so the author knows what to look for. Ends on the child, not on a rule. |
| `pipeline.nudge.medical_legal_advice.body` | Flag `medical_legal_advice` | This may read as medical or legal advice. Sharing your own experience is welcome. Advice on what someone should do is best left to their doctor, caseworker, or lawyer, who know their situation. | 210 | Opens by saying experience is welcome, so experienced carers do not feel talked down to. |
| `pipeline.nudge.hostile.body` | Flag `hostile` | This could land hard for the person reading it. Could you say it a gentler way? Disagreeing is fine. It's the wording that could hurt. | 160 | Describes the reader's experience, never the author's intent or character. "Disagreeing is fine" keeps this from reading as opinion policing, matching reply-coach rule 2. |
| `pipeline.nudge.consequence` | Line under every nudge body | If you post it as it is, it won't go through. Edit it and we'll take another look. | 110 | Says the quiet part plainly so the later block is never a surprise. Product owner may cut it (see open items); if cut, the block message carries more weight. |
| `pipeline.flag.multiple` | Appended under the body when more than one flag fired | There may be more than one thing to adjust. | 60 | The UI shows one flag body only (precedence below), then this line. Editing re-checks, so remaining flags surface next. |

Recommended precedence when several flags fire: `child_identifying`, `pii`, `medical_legal_advice`, `hostile`. Rationale: the first two are the hardest to undo once read. Engineering owns the final order.

#### 2. Block (second submit with the flagged text unchanged, or direct API rejection)

Panel structure: title, flag body, reason (where one exists), then the shared "how to fix" line. No button and no link: v1 has no override and no appeal, so the copy never offers either.

| id | context | string | max | notes |
|---|---|---|---|---|
| `pipeline.block.title` | Heading of every block panel | We can't post this yet | 40 | "Yet" signals it is fixable. Not "blocked", "rejected" or "denied". |
| `pipeline.block.pii.body` | Block, flag `pii` | Your comment seems to include a phone number, address, or email. Please take the contact details out, or share them in a direct message instead. | 180 | Says what to change and where else to put it. |
| `pipeline.block.child_identifying.body` | Block, flag `child_identifying` | Your comment seems to include details that could point to a child, like a name, school, photo, case details, or birth-family information. Please take those out, or keep it more general. | 220 | "Seems to" stays, because a Sonnet second opinion lowers but does not remove false positives. |
| `pipeline.block.medical_legal_advice.body` | Block, flag `medical_legal_advice` | Your comment seems to give advice about what someone should do medically or legally. Please share it as your own experience, or point them to their doctor, caseworker, or lawyer. | 200 | Offers two concrete rewrites of the intent. |
| `pipeline.block.hostile.body` | Block, flag `hostile` | The wording in your comment could hurt the person reading it. Please say it a gentler way. You can still say what you disagree with. | 150 | Ends by protecting the author's right to hold the opinion. |
| `pipeline.block.reason.confidentiality` | Shown under the body for `pii` and `child_identifying` only | Keeping private details out of comments protects the children in our community and their families. | 120 | The "why" the brief asks for. Phrased as protection, not prohibition. |
| `pipeline.block.reason.medical_legal` | Shown under the body for `medical_legal_advice` only | Every child's situation is different, and the people on their team know details we don't. | 110 | Ties the reason back to the child, not to liability. |
| `pipeline.block.how` | Shown under every block panel | Your comment is still here. Change the text and we'll check it again. | 90 | Reassures the draft is safe, which matters most to a tired author, and states the single path forward. |
| `pipeline.block.mistake` | Last line of every block panel (optional) | We don't always get this right. Try rewording it a little. | 80 | Honest about false positives without promising an appeal that does not exist. Product owner may cut it (see open items). |

`hostile` has no reason string on purpose: any "why" would sound like a lecture.

#### 3. Crisis (supportive, never blocking)

A `crisis` classification shows this panel and the comment is not blocked. The copy does not assume who is in crisis (the author, a child, someone else) and does not claim to know how the author feels.

| id | context | string | max | notes |
|---|---|---|---|---|
| `pipeline.crisis.title` | Heading of the crisis panel | Support is here if you want it | 50 | Offers; does not diagnose. |
| `pipeline.crisis.body` | Under the title | If things feel heavy right now, you don't have to carry it by yourself. Reaching out to someone can help. | 130 | "If things feel" is conditional, so it still reads as true when the classifier is wrong. Avoids therapy-speak ("valid", "journey", "I hear you"). |
| `pipeline.crisis.not_blocked` | Under the body | Your comment hasn't been blocked. You can post it whenever you're ready. | 100 | The explicit statement the brief requires. |
| `pipeline.crisis.resources.heading` | Above the resource list | Places that can help | 40 | |
| `pipeline.crisis.resources.list` | The resource list itself | `{{CRISIS_RESOURCES}}` | n/a | PLACEHOLDER. Product owner must supply vetted content. See "Product owner must supply" below. |
| `pipeline.crisis.emergency` | Below the resource list | If you or anyone near you is in immediate danger, call your local emergency number. | 120 | Deliberately generic: no number is named, so nothing is invented and it stays correct in every region. |
| `pipeline.crisis.admin_notice` | Optional last line | A member of our team may see this comment. | 70 | INCLUDE ONLY IF the product owner confirms. The data is flagged for an admin, but the admin queue UI is out of scope, so nobody may act on it yet. Never promise a reply or a check-in. |

#### 4. Checking and loading

| id | context | string | max | notes |
|---|---|---|---|---|
| `pipeline.submit.checking` | Submit button label while the pre-publish check runs (replaces `Comment`; `Posting…` still follows) | Checking… | 14 | Button label only. Set `aria-busy` on the button; do not announce it in a live region (see section 6). |
| `pipeline.submit.checking_slow` | Visible line beside the button if the check takes longer than about 3 seconds | Still checking. This is taking a little longer. | 70 | The client must time out and fail open, so this state always resolves. |

Typing-time checks stay silent, exactly as in `coach.state.loading` (nothing rendered). A loading message appears only after the author presses the submit button, because only then are they waiting on us.

#### 5. Fail-open: recommend silent

Recommendation: when the model fails, times out, refuses or returns invalid output, the UI says nothing and the comment publishes. Reasons:

1. It matches reply-coach (`coach.state.error` is silent) and the settled rule that model failure never blocks.
2. "We couldn't check this" after the author already pressed Comment adds worry and offers no action. It can also read as "your comment may be unsafe".
3. The visible `Checking…` state resolves into the comment appearing, so the author is not left waiting on something that never arrives. That keeps the a11y condition recorded in reply-coach `### Accessibility` §7 satisfied.

Failures are logged with `CoachErrorCategory`, not shown.

| id | context | string | max | notes |
|---|---|---|---|---|
| `pipeline.check.unavailable` | RESERVED, NOT SHIPPED. Only if the product owner overrules the silent recommendation. | We couldn't check this just now, so we've posted it as written. | 80 | Do not wire this in slice 1. |

#### 6. Screen-reader announcements

Each is one short polite status message, announced once when its panel appears. They do not repeat the panel text and never include any text from the draft. The visible panel is not itself a live region, so nothing is read twice. The a11y-auditor decides `polite` versus `alert` for the block announcement. The `Checking…` state has no announcement; the button's `aria-busy` is enough, and the result is announced when it arrives.

| id | context | string | max | notes |
|---|---|---|---|---|
| `pipeline.a11y.nudge` | Live region, nudge panel appears | Your comment hasn't posted yet. We have a note about it, just below. | 90 | States the most important fact first: it has not posted. |
| `pipeline.a11y.block` | Live region, block panel appears | Your comment wasn't posted. Please change the text, then try again. | 90 | |
| `pipeline.a11y.crisis` | Live region, crisis panel appears | Support information is below. Your comment hasn't been blocked. | 90 | |
| `pipeline.a11y.region.nudge` | `aria-label` of the nudge panel | A note about your comment | 40 | Replaces nothing in `coach.*`; the chip keeps `Suggested rewrite`. |
| `pipeline.a11y.region.block` | `aria-label` of the block panel | Comment not posted yet | 40 | |
| `pipeline.a11y.region.crisis` | `aria-label` of the crisis panel | Support information | 40 | |

When an edit clears a block or nudge and the re-check passes, say nothing. The panel simply goes away.

#### 7. Errors that preserve the draft

| id | context | string | max | notes |
|---|---|---|---|---|
| `pipeline.error.network` | Comment POST or check fails because the connection dropped | We couldn't connect. Your comment is still here, so try again in a moment. | 90 | The submit button is the retry, so no extra button label is needed. |
| `pipeline.error.generic` | Any other non-block server failure on the comment POST | We couldn't post your comment. It's still here, so try again in a moment. | 90 | Replaces the terse `Could not post.` in `CommentForm.tsx`. Include only if frontend-dev agrees to widen that one string. |

A block returned by the server (direct POST with flagged text, or a verdict token mismatch) must be mapped by the frontend to the section 2 strings by error code. Never render the server's raw error message in the composer.

#### Voice checklist (microcopy-voice skill and design-system Voice & Tone)

| rule | result |
|---|---|
| Plural "we" as the platform, never "I" | Pass. Strings speak as "we" or address "you / your comment". |
| Active voice, short sentences | Pass. Longest sentence is 23 words (`pipeline.block.child_identifying.body`). |
| Warm, not saccharine, not patronising | Pass. No praise, no reassurance clichés, no pet phrases. |
| No exclamation marks (CTAs excepted) | Pass. None; there are no CTAs in this table. |
| No emoji | Pass. |
| Imperative CTAs | Not applicable. No new buttons. `Checking…` is a state label. |
| Lead with what changed for the user | Pass. Block bodies lead with what the comment contains, then what to change. |
| Does not contradict reply-coach rules | Pass with one distinction, below. |

Distinction from reply-coach rule 3 ("never name the category"): these strings name the content the author can see and change ("a phone number", "a school"), never the classifier's label. No string says PII, hostile, flagged, minimization or any category name.

#### What we never say

- "Violation", "violated", "policy", "prohibited", "not allowed", "inappropriate", "unsafe", "rejected", "denied", "banned".
- The classifier's labels: PII, hostile, toxic, abusive, sensitive, "child-identifying".
- "Flagged", "detected", "our system noticed", "AI", "the model", "automatically". We do not claim a human reviewed anything.
- "Appeal", "contact support", "request a review", "override", "post anyway". None exists in v1, so we never imply one.
- Anything about the author's intent or character: "you meant", "you clearly", "you should know better", "careless".
- Words that shame or warn: "warning", "last chance", "strike", "you failed to", "you must".
- Therapy-speak (carried over from reply-coach rule 7): "I hear you", "valid", "journey", "lived experience".
- "At least", "just", "simply", "obviously": they minimise the effort of editing.
- Any quote, count or paraphrase of the draft's content, including in the live-region strings.
- Exclamation marks and emoji.

#### Rationale for tone choices

- **Tired and protective readers.** Foster parents read these at the end of a long day, often about a child they are fighting for. So the first words say what happened to the comment, the draft is promised safe, and there is one path forward.
- **Fear of being judged.** Strings use "may", "seems to" and "could" because the classifier can be wrong, and confident accusations about a carer's words land badly. They describe the reader's experience ("could land hard for the person reading it") and never the author.
- **Confidentiality as care.** The block explains that privacy protects the children and their families, so the rule reads as shared purpose rather than platform control. That is the same reason a carer would give.
- **Honest about consequences.** The nudge tells the author up front that an unchanged post will not go through. Silent coach-then-block would feel like an ambush. The cost is a heavier nudge, and the string can be cut.
- **Firm without cold.** "We can't post this yet" is a clear no with a clear way forward. Blocks never apologise excessively and never offer something that is not there.
- **Crisis is an offer.** The panel is conditional ("if things feel heavy"), does not diagnose, and says plainly that the comment is not blocked. Support is something to take, not something imposed.
- **Silence where silence is kinder.** Typing-time checks and model failures say nothing, consistent with reply-coach.

#### Product owner must supply (blocking for the crisis panel)

1. `{{CRISIS_RESOURCES}}`: a vetted list of support resources (name, how to reach, hours, region or country coverage, and whether foster-specific or general). Do not ship slice 1 `crisis` handling with the placeholder. No hotline names, numbers or URLs are invented in this spec.
2. Confirmation that the generic line in `pipeline.crisis.emergency` ("your local emergency number") is acceptable, or the approved regional wording.
3. Decision on `pipeline.crisis.admin_notice`: tell the author an admin may see the comment, or say nothing. Recommended: say it, once the admin queue exists.

#### Open items for design-lead and ui-designer

1. **Settings copy now overstates.** `settings.coach.help` in reply-coach says "You can always post your original." That stays true for tone rewrites but not for these flags. The ux-writer cannot change it; propose a reword when settings ships.
2. **One panel at a time.** Confirm that a pipeline panel suppresses `CoachChip` for the same draft. Also confirm the keyboard order and focus target when a panel appears (a11y-auditor).
3. **Crisis flow.** This copy assumes the crisis panel appears on submit and the comment stays postable with the normal `Comment` button. If the design needs a second press, do not label it "Post anyway".
4. **Optional cuts.** `pipeline.nudge.consequence` and `pipeline.block.mistake` are the two most debatable lines. Recommended: ship both for v1 and measure.
5. **Button label.** The composer button reads `Comment`, not `Post`. `Checking…` replaces it in place.

### Accessibility
*(filled by a11y-auditor)*

## Marketing — Spec

### Launch copy
*(filled by content-writer)*

### SEO
*(filled by seo-specialist)*

### Growth
*(filled by growth-analyst)*
