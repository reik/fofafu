import type { CoachInput, CoachResponse } from '../../schemas/coach.schemas.js';
import { COACH_SYSTEM_PROMPT } from './systemPrompt.js';
import { isReplyCoachLiveEnabled } from './featureFlags.js';
import { isCoachCostCapExceeded, recordCoachSpend } from './costCap.js';
import { isInHoldback } from './holdback.js';
import Anthropic from '@anthropic-ai/sdk';

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

/**
 * Minimal shape `LiveClaudeClient` depends on from `@anthropic-ai/sdk`'s
 * `Anthropic` client. Kept narrow and structural (not `import type { Anthropic
 * } from '@anthropic-ai/sdk'` directly) so tests can inject a plain object
 * mock — this is the seam `tests/coach-live.test.ts`'s
 * `makeFakeAnthropicClient()` targets.
 */
export interface AnthropicLikeClient {
  messages: {
    create(params: Record<string, unknown>): Promise<{
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    }>;
  };
}

/**
 * reply-coach-live: wraps the real Anthropic SDK behind the same
 * `ClaudeClient` seam `MockClaudeClient` implements. The Anthropic client
 * itself is injected (constructor param) rather than constructed inline, so
 * this class never touches the network in tests — see
 * `tests/coach-live.test.ts`.
 *
 * Rough per-call cost is recorded via `recordCoachSpend` (see `costCap.ts`)
 * using Anthropic's published Haiku per-token pricing as of this writing
 * ($0.80/M input tokens, $4/M output tokens — Claude 3.5 Haiku). This is an
 * approximation for the cost-cap AC, not billing-grade accounting; documented
 * as a simplification in this feature's `### Backend` subsection.
 */
const INPUT_USD_PER_TOKEN = 0.8 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 4 / 1_000_000;

function buildUserMessage(input: CoachInput): string {
  const context = input.threadContext
    ? `\n\nThread context:\n${JSON.stringify(input.threadContext)}`
    : '';
  return `Draft comment:\n${input.draft}${context}`;
}

export class LiveClaudeClient implements ClaudeClient {
  constructor(
    private readonly client: AnthropicLikeClient,
    private readonly model: string = 'claude-3-5-haiku-20241022',
  ) {}

  async coach(input: CoachInput): Promise<CoachResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: COACH_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: buildUserMessage(input) }],
    });

    if (response.usage) {
      const usd =
        response.usage.input_tokens * INPUT_USD_PER_TOKEN +
        response.usage.output_tokens * OUTPUT_USD_PER_TOKEN;
      recordCoachSpend(usd);
    }

    const block = response.content[0];
    if (!block || block.type !== 'text' || !block.text) {
      throw new Error('[coach] LiveClaudeClient: unexpected response shape from Anthropic client');
    }
    // Parsing errors (malformed JSON) intentionally propagate — the
    // controller's existing silent-fallback catch handles it, matching the
    // "live SDK throws -> verdict=ok" behavior in the acceptance criteria.
    return JSON.parse(block.text) as CoachResponse;
  }
}

let testOverride: ClaudeClient | null = null;
let mockSingleton: ClaudeClient | null = null;
let liveSingleton: ClaudeClient | null = null;

function buildLiveClaudeClient(): ClaudeClient {
  // Lazily constructed and only reached when the live flag is genuinely on
  // (see `getClaudeClient` below) — never invoked by the test suite, which
  // never sets REPLY_COACH_LIVE_ENABLED=true.
  const sdkClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' }) as unknown as AnthropicLikeClient;
  return new LiveClaudeClient(sdkClient);
}

/**
 * Registered-client resolver. Precedence:
 *   1. Test override (`setClaudeClientForTests`) — always wins.
 *   2. Live client, IF `isReplyCoachLiveEnabled()` AND the daily cost cap is
 *      not exceeded AND (no userId given, or the userId is not in the
 *      holdback control arm).
 *   3. Mock client otherwise — this is also the behavior for the holdback
 *      control arm and cap-exceeded degrade, per the feature's silent-
 *      fallback design (indistinguishable from `verdict: 'ok'`).
 *
 * `userId` is optional so existing non-controller call sites (and the
 * `coach-live.test.ts` `getClaudeClient?: () => unknown` typing) keep
 * working without it.
 */
export function getClaudeClient(userId?: string): ClaudeClient {
  if (testOverride) return testOverride;

  const liveEligible =
    isReplyCoachLiveEnabled() &&
    !isCoachCostCapExceeded() &&
    !(userId !== undefined && isInHoldback(userId));

  if (liveEligible) {
    if (!liveSingleton) liveSingleton = buildLiveClaudeClient();
    return liveSingleton;
  }

  if (!mockSingleton) mockSingleton = new MockClaudeClient();
  return mockSingleton;
}

/**
 * Test hook — lets a test swap in a stub client (e.g. one that throws to
 * exercise the failure path) without monkey-patching the module.
 */
export function setClaudeClientForTests(client: ClaudeClient | null): void {
  testOverride = client;
}
