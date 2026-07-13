/**
 * Static sweep for [[features/brand-contrast-fix]].
 *
 * `color.brand.primary` (#4D9463) fails WCAG 1.4.3 for normal text when
 * paired with white text (~3.4:1, needs 4.5:1). Every CTA that currently
 * renders `text-white` on `bg-brand-primary` (with no `-pressed`/darker
 * suffix) has migrated to the accessible pair chosen by design (see
 * `### Visual` in the feature spec). This test should stay green going
 * forward — it guards against reintroducing the failing pairing.
 *
 * This is a source-scan, not a rendered-DOM check, because jsdom has no
 * real layout engine and can't compute contrast (see src/tests/a11y.ts).
 * It was written before frontend-dev's migration landed — per the
 * project's TDD rule, the test is written first.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SRC_ROOT = path.resolve(__dirname, '..');

// Matches `bg-brand-primary` NOT immediately followed by a `-` (which would
// indicate a migrated/darker token, e.g. `bg-brand-primary-pressed`), so
// opacity modifiers like `bg-brand-primary/90` still count as unmigrated.
const UNMIGRATED_BG = /bg-brand-primary(?!-)/;
const WHITE_TEXT = /text-white\b/;

function listTsxFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      results.push(path.relative(SRC_ROOT, fullPath));
    }
  }
  return results;
}

function findViolations(): Array<{ file: string; line: number; text: string }> {
  const files = listTsxFiles(SRC_ROOT).filter(
    (f) => !f.includes('.test.') && !f.includes(`tests${path.sep}`),
  );

  const violations: Array<{ file: string; line: number; text: string }> = [];

  for (const relFile of files) {
    const absFile = path.join(SRC_ROOT, relFile);
    const lines = readFileSync(absFile, 'utf-8').split('\n');
    lines.forEach((line, idx) => {
      if (UNMIGRATED_BG.test(line) && WHITE_TEXT.test(line)) {
        violations.push({ file: relFile, line: idx + 1, text: line.trim() });
      }
    });
  }

  return violations;
}

describe('brand-contrast-fix — no CTA pairs white text with unmigrated brand.primary', () => {
  it('has zero occurrences of text-white on bg-brand-primary across src/', () => {
    const violations = findViolations();
    const report = violations
      .map((v) => `  ${v.file}:${v.line}  ${v.text}`)
      .join('\n');

    expect(
      violations.length,
      `Found ${violations.length} CTA(s) still pairing text-white with the unmigrated ` +
        `bg-brand-primary token. Migrate to the accessible pair (e.g. bg-brand-primary-pressed) ` +
        `per fofafu_vault/features/brand-contrast-fix.md:\n${report}`,
    ).toBe(0);
  });
});
