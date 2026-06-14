# Interview Walkthrough Scripts

Use these as speaking notes. The goal is to show judgment: the AI tools are part of the engineering system, but the repo still has explicit specs, ownership, tests, and review gates.

## 30-second answer

"This project is a rewrite of a foster-family community app. I used AI tools as a structured development partner rather than as a one-off code generator. The repo has a tracked Obsidian vault for feature specs, kanban state, and logs. Work enters through `/dispatch <feature>`, which routes a feature through engineering, design, and marketing roles. Each role owns a specific section of the feature file, and the implementation is validated with backend integration tests, frontend component tests, accessibility checks, TypeScript, and builds."

## 2-minute walkthrough

"The first thing I would show is `README.md` and `CLAUDE.md`. They explain the product and the operating model. The important design choice is that the AI workflow is written down in the repo, not hidden in chat history."

"Next I would open `vault/features/edit-comment.md`. This is a good example because it has the problem statement, acceptance criteria, backend contract, frontend behavior, test plan, and final shipped state in one place. The AI roles did not just write code; they left an auditable trail of the decisions and quality gates."

"Then I would open `vault/protocols/dispatch.md`. The workflow is deliberately bounded: the dispatcher classifies the feature, fans out specialists, team leads aggregate, and the dispatcher moves the feature through the status machine. This prevents the tool from becoming an unstructured stream of suggestions."

"Finally I would show the real code and tests. For `edit-comment`, the backend added `PATCH /api/comments/:id`, DTO changes, migration support, and integration tests. The frontend added the inline edit form, local update behavior, and component tests. That lets me talk about how I use AI for speed while still holding the code to normal engineering standards."

## 5-minute live demo

1. Start with the operating model:

   ```bash
   sed -n '1,140p' CLAUDE.md
   sed -n '1,160p' vault/protocols/dispatch.md
   ```

   Say: "This is the part I care about most. The tool has a process contract: entry points, writer ownership, status transitions, and retry behavior."

2. Show shipped feature evidence:

   ```bash
   sed -n '1,220p' vault/features/edit-comment.md
   ```

   Say: "This feature file is both the spec and the audit record. You can see acceptance criteria, API contract, frontend behavior, files touched, and test results."

3. Show implementation files:

   ```bash
   sed -n '1,220p' backend/src/controllers/announcement.controller.ts
   sed -n '1,220p' frontend/src/features/feed/components/CommentList.tsx
   ```

   Say: "I still review the actual code paths. The AI output has to match the existing architecture: Express controllers and Zod schemas on the backend, React Query and tested components on the frontend."

4. Show quality gates:

   ```bash
   npm run demo:check
   npm run demo:check -- --full
   ```

   Say: "For a short interview I run the fast snapshot. If there is time, the full version runs backend tests, frontend tests, and TypeScript."

## Strong example feature: edit-comment

Use this when asked for a concrete story.

"The user problem was simple: announcements could be edited, comments could be deleted, but comments could not be edited. I asked the AI workflow to treat that as a real feature, not just a quick patch. The backend role defined the API contract and authorization behavior. The frontend role implemented the inline editor and state update. QA added boundary and UI behavior tests. The result shipped with the feature spec updated to show what changed and which checks passed."

Good files to open:

- `vault/features/edit-comment.md`
- `backend/src/controllers/announcement.controller.ts`
- `backend/tests/announcements.test.ts`
- `frontend/src/features/feed/components/CommentList.tsx`
- `frontend/src/features/feed/components/CommentEditForm.tsx`
- `frontend/src/features/feed/components/CommentList.test.tsx`

## How to answer "what did the AI do?"

"I used it in three ways. First, planning: it turned product gaps into acceptance criteria and implementation contracts. Second, implementation: it made scoped backend and frontend changes that matched existing patterns. Third, verification: it created or updated tests and summarized the quality gates. My role was to set the operating constraints, review the design, run the checks, and decide what shipped."

## How to answer "how do you avoid hallucinated code?"

"I keep the source of truth local and inspectable. The agents have to read the existing code, feature file, and dispatch protocol. Writer ownership prevents multiple roles from editing the same section. Every feature needs executable checks, and I prefer changes that reuse the codebase's existing patterns. If the tool proposes something that does not fit the repo, the process catches it in review or tests."

## How to answer "what would you improve next?"

"I would keep making the demo path more repeatable. I would also add a small generated index of shipped features from the vault, so an interviewer or contributor can jump from a feature to its code, tests, and ship log without manually searching."

## Backup path if live tests are slow

Run:

```bash
npm run demo:check
```

Then show the documented test results in `STATUS.md` and the feature-level quality gates in `vault/features/edit-comment.md`. Be clear that this is the fallback because live test runs can take interview time.
