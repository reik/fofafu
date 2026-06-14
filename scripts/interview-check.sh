#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

run_full=false
if [[ "${1:-}" == "--full" ]]; then
  run_full=true
fi

section() {
  printf '\n== %s ==\n' "$1"
}

section "Project snapshot"
printf 'Repo: %s\n' "$ROOT_DIR"
printf 'Branch: '
git branch --show-current

printf 'Working tree:\n'
if [[ -n "$(git status --short)" ]]; then
  git status --short
else
  printf 'clean\n'
fi

section "AI development model"
printf 'Source of truth: vault/features, vault/kanban, vault/log\n'
printf 'Entry point: /dispatch <feature>\n'
printf 'Protocol: vault/protocols/dispatch.md\n'
printf 'Agent roles: .claude/agents\n'

section "Feature evidence"
feature_count="$(find vault/features -maxdepth 1 -type f -name '*.md' ! -name '_template.md' | wc -l | tr -d ' ')"
printf 'Feature specs: %s\n' "$feature_count"
printf 'Top shipped items from company kanban:\n'
awk '
  /^## Done/ { in_done = 1; next }
  /^## / && in_done { exit }
  in_done && /^- \[x\]/ {
    sub(/^- \[x\] /, "- ")
    print
    count++
    if (count == 6) exit
  }
' vault/kanban/company.md

section "Useful interview commands"
printf 'npm run demo:check          # this fast walkthrough snapshot\n'
printf 'npm run demo:check -- --full # snapshot plus backend/frontend tests\n'
printf 'npm run typecheck           # both TypeScript workspaces\n'
printf 'npm test                    # backend and frontend test suites\n'

if [[ "$run_full" == true ]]; then
  section "Backend tests"
  npm run test:backend

  section "Frontend tests"
  npm run test:frontend

  section "TypeScript"
  npm run typecheck
else
  section "Skipped full checks"
  printf 'Run npm run demo:check -- --full when you want to show the live quality gates.\n'
fi
