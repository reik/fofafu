import Anthropic from '@anthropic-ai/sdk';

/**
 * Why a Reply Coach call failed. Logged by the controller so the silent
 * `verdict=ok` fallback is observable without exposing anything to users.
 *
 * Transport / API (from `@anthropic-ai/sdk` typed errors):
 *   rate_limited    429 — org rate limit hit
 *   overloaded      529 — Anthropic temporarily overloaded
 *   upstream_error  other 5xx
 *   timeout         request timed out before a response
 *   network         connection failed (DNS, reset, …)
 *   auth            401/403 — bad or unauthorized ANTHROPIC_API_KEY
 *   bad_request     other 4xx — our request is malformed (model id, params)
 *
 * Response contract (thrown by `LiveClaudeClient`):
 *   refusal          stop_reason "refusal" — the model declined
 *   truncated        stop_reason "max_tokens" — verdict cut off
 *   no_tool_call     response never called submit_coach_verdict
 *   invalid_verdict  tool input failed the CoachResponse schema
 *
 *   unknown          anything else
 */
export type CoachErrorCategory =
  | 'rate_limited'
  | 'overloaded'
  | 'upstream_error'
  | 'timeout'
  | 'network'
  | 'auth'
  | 'bad_request'
  | 'refusal'
  | 'truncated'
  | 'no_tool_call'
  | 'invalid_verdict'
  | 'unknown';

export interface CoachErrorInfo {
  category: CoachErrorCategory;
  retryable: boolean;
  status?: number;
}

/** Thrown by `LiveClaudeClient` when the response breaks the coach contract. */
export class CoachClientError extends Error {
  constructor(
    readonly category: CoachErrorCategory,
    message: string,
  ) {
    super(`[coach] ${category}: ${message}`);
    this.name = 'CoachClientError';
  }
}

function classifyStatus(status: number): CoachErrorInfo {
  if (status === 429) return { category: 'rate_limited', retryable: true, status };
  if (status === 529) return { category: 'overloaded', retryable: true, status };
  if (status >= 500) return { category: 'upstream_error', retryable: true, status };
  if (status === 401 || status === 403) return { category: 'auth', retryable: false, status };
  return { category: 'bad_request', retryable: false, status };
}

export function classifyCoachError(err: unknown): CoachErrorInfo {
  if (err instanceof CoachClientError) return { category: err.category, retryable: false };
  // Timeout extends ConnectionError, which extends APIError — check most specific first.
  if (err instanceof Anthropic.APIConnectionTimeoutError) return { category: 'timeout', retryable: true };
  if (err instanceof Anthropic.APIConnectionError) return { category: 'network', retryable: true };
  if (err instanceof Anthropic.APIError && typeof err.status === 'number') return classifyStatus(err.status);
  return { category: 'unknown', retryable: false };
}
