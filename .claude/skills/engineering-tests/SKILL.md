---
name: engineering-tests
description: Test-plan and coverage conventions for Vitest/RTL + node:test projects — write tests before implementation, real-DB integration tests, coverage targets. Use when defining a test plan or writing tests for a feature. See references/e2e-conventions.md for Playwright/E2E-specific guidance.
---

# QA conventions

## Ordering

Tests are written **before** implementation (TDD). For each acceptance criterion, name: test type (unit / integration / E2E), file path, one-line assertion — before writing any implementation code.

## Coverage targets

- 80% line coverage per workspace/package.
- Every API endpoint gets an integration test against a **real** database — no mocks at the network/DB boundary. Mocking here has previously hidden migration-vs-code divergence; don't reintroduce it.
- Every form gets a smoke test asserting the validation-error path, not just the happy path.

## Sanity sweep (run on demand or pre-merge)

- `tsc --noEmit` on each workspace
- `eslint .` (or project linter) on each workspace
- Full test run with coverage flag

A failing sweep is a bug, not a nice-to-have — file it as such rather than waving it through.

## E2E specs

For Playwright/E2E-specific conventions (spec organization, selectors, when to skip), see `references/e2e-conventions.md`.
