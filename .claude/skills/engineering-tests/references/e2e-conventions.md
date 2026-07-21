# E2E test conventions (Playwright)

## Scope check first

If the change is backend-only (no route, page, or component diff), there is nothing to cover — say so explicitly rather than writing a vacuous spec.

## File organization

One spec file per feature/flow (`e2e/<feature>.spec.ts`). Reuse an existing file if the feature enhances a flow already covered rather than fragmenting coverage across files.

## Selectors

Prefer `getByRole` / `getByLabel` over CSS/test-id selectors — matches accessible-name-based testing conventions and stays stable across markup refactors.

## Coverage shape

For each user-visible acceptance criterion: happy path is mandatory; add one failure/edge case only if the criterion specifies validation or an explicit error state. Don't pad coverage with redundant paths already covered by unit/component tests.

## When a flow needs data you don't have

If a scenario needs auth or seeded data the dev environment doesn't provide, don't invent a fixture inline — note the dependency explicitly so it can be wired at the right layer (seed script, test fixture, etc).

## Running

One pass covering the spec file(s) you touched is enough — don't re-run the entire E2E suite repeatedly during iteration.
