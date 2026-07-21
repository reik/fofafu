---
name: engineering-code-review
description: Checklist-driven review pass for React/TS(+Node) diffs — must-fix vs nice-to-have taxonomy, contract-drift detection, large-diff triage. Use when reviewing a PR or branch diff in a React/TypeScript project.
---

# Code review checklist

## Classify every finding as must-fix or nice-to-have

**Must-fix:**
- Bug, security issue, or contract drift between backend/frontend (e.g. backend returns `foo, bar`, frontend Zod schema reads `foo, baz`)
- Missing test for a new endpoint or exported function
- `any` introduced, or TS strict violated
- Hand-written `useEffect` doing what TanStack Query (or equivalent server-state lib) should
- Controlled inputs written by hand where React Hook Form (or equivalent) is the project convention
- `console.log` left in committed code

**Nice-to-have:**
- Naming, premature abstraction
- A comment explaining *what* instead of *why*
- Missed opportunity to simplify or reuse an existing helper
- Missed barrel/index re-export where the project convention expects one

## Spot-check, don't reprove

- Run `tsc --noEmit` if a finding hinges on type behavior — don't re-run the full test suite, that's QA's job.
- Cross-check acceptance criteria (if any are stated) against the diff; a plausible mismatch is must-fix.

## When the diff is huge (>~50 files or >~2000 lines)

Focus only on:
1. New public endpoints/routes (each gets a paragraph)
2. New shared types/schemas (check strictness + naming)
3. Files introducing `any` or `@ts-ignore` (must-fix unless justified inline)
4. Files at the API/contract boundary (e.g. `routes/`, `api/` client layer)

Skip exhaustive review of pure refactors, test files, and generated code — note their scope and move on.

## Output shape

```
**Summary.** <scope reviewed, overall verdict>

**Must-fix**
- <file:line> — <finding> (<why it matters>)

**Nice-to-have**
- <file:line> — <finding>
```
Write "Must-fix: none." explicitly when clean — never omit the heading.
