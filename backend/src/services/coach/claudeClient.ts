import type { CoachInput, CoachResponse } from '../../schemas/coach.schemas.js';

/**
 * The seam between the coach controller and whatever language model produces
 * the verdict. `MockClaudeClient` (this file) serves v1; `reply-coach-live`
 * will ship a `LiveClaudeClient` that calls `@anthropic-ai/sdk` against the
 * same interface.
 */
export interface ClaudeClient {
  coach(input: CoachInput): Promise<CoachResponse>;
}

/**
 * Canonical fixtures, mirrored byte-for-byte from
 * `fofafu_vault/features/reply-coach.md` -> `### Microcopy` Part 2.
 *
 * Any drift here is a bug in this file, not a redesign. When `reply-coach-live`
 * lands, the live system prompt is graded against the SAME strings.
 */
const FIXTURE_OK: CoachResponse = {
  verdict: 'ok',
  categories: [],
  reasoning: '',
  rewrite: null,
};

const FIXTURE_MINIMIZATION: CoachResponse = {
  verdict: 'suggest',
  categories: ['minimization'],
  reasoning:
    '"At least" can shrink a loss the family is still carrying — a phrasing that stays with the loss tends to land softer.',
  rewrite: "The time you had with her mattered, and I'm sorry it's ending this way.",
};

const FIXTURE_SAVIOR: CoachResponse = {
  verdict: 'suggest',
  categories: ['savior-framing'],
  reasoning:
    'Calling a foster parent a saint can make the everyday work feel like a performance — naming the care directly tends to feel closer.',
  rewrite: "He's lucky to have you showing up for him like this.",
};

const DRAFT_NEUTRAL = 'Praying for your family this week.';
const DRAFT_MINIMIZATION = 'At least you got to keep her for a while.';
const DRAFT_SAVIOR = "You're such a saint for taking him in.";

/**
 * Mock client. Pure function of draft text — `threadContext` is ignored in v1.
 * Any draft that doesn't exactly match a canonical fixture returns the
 * neutral `verdict: 'ok'` shape so the composer stays silent.
 *
 * Match is exact (case-sensitive, whitespace-sensitive) to keep the contract
 * legible: the fixture list IS the test surface. A "fuzzy" match would
 * paper over future system-prompt regressions in `reply-coach-live`.
 */
export class MockClaudeClient implements ClaudeClient {
  async coach(input: CoachInput): Promise<CoachResponse> {
    switch (input.draft) {
      case DRAFT_NEUTRAL:
        return FIXTURE_OK;
      case DRAFT_MINIMIZATION:
        return FIXTURE_MINIMIZATION;
      case DRAFT_SAVIOR:
        return FIXTURE_SAVIOR;
      default:
        return FIXTURE_OK;
    }
  }
}

let cached: ClaudeClient | null = null;

export function getClaudeClient(): ClaudeClient {
  if (!cached) cached = new MockClaudeClient();
  return cached;
}

/**
 * Test hook — lets a test swap in a stub client (e.g. one that throws to
 * exercise the failure path) without monkey-patching the module.
 */
export function setClaudeClientForTests(client: ClaudeClient | null): void {
  cached = client;
}
