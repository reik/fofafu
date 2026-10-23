## Summary

<!-- What changed and why -->

## Screenshots

<!-- Required for any PR that adds or changes a page, UI flow, or other user-visible behavior.
     See fofafu_vault/standards/engineering-standards.md for the before/after convention. -->

## Checklist

- [ ] Tests written before implementation (TDD) and pass locally
- [ ] `npm run typecheck` and lint pass
- [ ] Screenshots attached if this PR touches UI (see engineering-standards.md)
- [ ] **Async/loading-state check**: if this PR touches a component that gates behavior on
      asynchronously-restored state (auth/session hydration, feature flags, etc.), I verified
      the cold-start path by hand (hard refresh, not just in-app navigation) and the component
      gates on the loading flag, not just the resolved value — see
      `fofafu_vault/standards/engineering-standards.md` § Async-restored state. N/A otherwise.
