// coach-verdict-tool follow-up: every Reply Coach failure is classified into
// a CoachErrorCategory so logs say WHY the coach fell back to verdict=ok.
// All Anthropic errors here are constructed locally — no network.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import type { AnthropicLikeClient } from '../src/services/coach/claudeClient.js';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { classifyCoachError, CoachClientError } = await import('../src/services/coach/coachErrors.js');
const { LiveClaudeClient } = await import('../src/services/coach/claudeClient.js');

function apiError(status: number) {
  return Anthropic.APIError.generate(status, { type: 'error', error: { type: 'x', message: 'x' } }, 'x', {});
}

describe('classifyCoachError: Anthropic SDK errors', () => {
  it('should_classify_429_as_rate_limited_and_retryable', () => {
    assert.deepEqual(classifyCoachError(apiError(429)), { category: 'rate_limited', retryable: true, status: 429 });
  });

  it('should_classify_529_as_overloaded_and_retryable', () => {
    assert.deepEqual(classifyCoachError(apiError(529)), { category: 'overloaded', retryable: true, status: 529 });
  });

  it('should_classify_other_5xx_as_upstream_error_and_retryable', () => {
    assert.deepEqual(classifyCoachError(apiError(500)), { category: 'upstream_error', retryable: true, status: 500 });
  });

  it('should_classify_401_as_auth_and_not_retryable', () => {
    assert.deepEqual(classifyCoachError(apiError(401)), { category: 'auth', retryable: false, status: 401 });
  });

  it('should_classify_403_as_auth_and_not_retryable', () => {
    assert.deepEqual(classifyCoachError(apiError(403)), { category: 'auth', retryable: false, status: 403 });
  });

  it('should_classify_400_as_bad_request_and_not_retryable', () => {
    assert.deepEqual(classifyCoachError(apiError(400)), { category: 'bad_request', retryable: false, status: 400 });
  });

  it('should_classify_404_as_bad_request_and_not_retryable', () => {
    assert.deepEqual(classifyCoachError(apiError(404)), { category: 'bad_request', retryable: false, status: 404 });
  });

  it('should_classify_a_connection_timeout_as_timeout_and_retryable', () => {
    assert.deepEqual(classifyCoachError(new Anthropic.APIConnectionTimeoutError()), { category: 'timeout', retryable: true });
  });

  it('should_classify_a_connection_failure_as_network_and_retryable', () => {
    assert.deepEqual(
      classifyCoachError(new Anthropic.APIConnectionError({ message: 'socket hang up' })),
      { category: 'network', retryable: true },
    );
  });
});

describe('classifyCoachError: coach-specific and unknown errors', () => {
  it('should_pass_through_the_category_of_a_CoachClientError', () => {
    assert.deepEqual(classifyCoachError(new CoachClientError('refusal', 'declined')), { category: 'refusal', retryable: false });
  });

  it('should_classify_a_plain_Error_as_unknown', () => {
    assert.deepEqual(classifyCoachError(new Error('boom')), { category: 'unknown', retryable: false });
  });

  it('should_classify_a_non_Error_throw_as_unknown', () => {
    assert.deepEqual(classifyCoachError('boom'), { category: 'unknown', retryable: false });
  });
});

type FakeResponse = Awaited<ReturnType<AnthropicLikeClient['messages']['create']>>;

function fakeClient(response: Pick<FakeResponse, 'content' | 'stop_reason'>): AnthropicLikeClient {
  return { messages: { create: async () => ({ ...response, usage: { input_tokens: 1, output_tokens: 1 } }) } };
}

async function categoryOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    return classifyCoachError(err).category;
  }
  return 'did-not-throw';
}

describe('LiveClaudeClient: throws categorized CoachClientErrors', () => {
  it('should_throw_refusal_when_stop_reason_is_refusal', async () => {
    const client = new LiveClaudeClient(fakeClient({ content: [], stop_reason: 'refusal' }));
    assert.equal(await categoryOf(client.coach({ draft: 'x' })), 'refusal');
  });

  it('should_throw_truncated_when_stop_reason_is_max_tokens', async () => {
    const client = new LiveClaudeClient(fakeClient({ content: [], stop_reason: 'max_tokens' }));
    assert.equal(await categoryOf(client.coach({ draft: 'x' })), 'truncated');
  });

  it('should_throw_no_tool_call_when_the_verdict_tool_was_not_called', async () => {
    const client = new LiveClaudeClient(fakeClient({ content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn' }));
    assert.equal(await categoryOf(client.coach({ draft: 'x' })), 'no_tool_call');
  });

  it('should_throw_invalid_verdict_when_the_tool_input_fails_the_schema', async () => {
    const client = new LiveClaudeClient(fakeClient({
      content: [{ type: 'tool_use', name: 'submit_coach_verdict', input: { verdict: 'maybe' } }],
      stop_reason: 'tool_use',
    }));
    assert.equal(await categoryOf(client.coach({ draft: 'x' })), 'invalid_verdict');
  });
});
