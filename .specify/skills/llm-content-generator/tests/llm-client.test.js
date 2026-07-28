'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isTransientError,
  buildHttpCallConfig,
  parseProviderResponse,
  redactForLogging,
  callWithRetry
} = require('../scripts/llm-client');

test('isTransientError recognizes rate-limit and server errors as transient', () => {
  assert.equal(isTransientError({ statusCode: 429 }), true);
  assert.equal(isTransientError({ statusCode: 503 }), true);
  assert.equal(isTransientError({ code: 'ETIMEDOUT' }), true);
});

test('isTransientError treats client errors (400/401/404) as non-transient', () => {
  assert.equal(isTransientError({ statusCode: 400 }), false);
  assert.equal(isTransientError({ statusCode: 401 }), false);
  assert.equal(isTransientError({ statusCode: 404 }), false);
});

test('buildHttpCallConfig never embeds a credential value, only a reference', () => {
  const config = buildHttpCallConfig(
    { baseUrl: 'https://api.groq.com/openai/v1/chat/completions', timeoutMs: 20000, retryCount: 3, retryDelayMs: 5000 },
    'groqApiCredential'
  );
  assert.equal(config.credentialRef, 'groqApiCredential');
  assert.equal(config.headers['Content-Type'], 'application/json');
  assert.equal(config.rawContentType, 'application/json');
  assert.ok(!JSON.stringify(config).includes('gsk_'));
});

test('buildHttpCallConfig throws when baseUrl or credentialRef is missing', () => {
  assert.throws(() => buildHttpCallConfig({}, 'ref'));
  assert.throws(() => buildHttpCallConfig({ baseUrl: 'https://x' }, undefined));
});

test('parseProviderResponse extracts content from a valid envelope', () => {
  const parsed = parseProviderResponse({ choices: [{ message: { content: '{"headline":"x"}' } }], usage: { total_tokens: 42 } });
  assert.equal(parsed.content, '{"headline":"x"}');
  assert.equal(parsed.usage.total_tokens, 42);
});

test('parseProviderResponse throws on a malformed envelope', () => {
  assert.throws(() => parseProviderResponse({}));
  assert.throws(() => parseProviderResponse({ choices: [] }));
  assert.throws(() => parseProviderResponse({ choices: [{ message: {} }] }));
});

test('redactForLogging removes Authorization headers, credential refs, and message content', () => {
  const redacted = redactForLogging({
    headers: { Authorization: 'Bearer gsk_secret' },
    credentialRef: 'groqApiCredential',
    messages: [{ role: 'system', content: 'sensitive prompt text' }]
  });
  assert.equal(redacted.headers.Authorization, '[REDACTED]');
  assert.equal(redacted.credentialRef, '[REDACTED]');
  assert.ok(!redacted.messages[0].content.includes('sensitive prompt text'));
});

test('callWithRetry succeeds immediately when the transport succeeds on the first attempt', async () => {
  const transport = async () => ({ choices: [{ message: { content: 'ok' } }] });
  const result = await callWithRetry(transport, {}, { retryCount: 3, delayFn: async () => {} });
  assert.equal(result.content, 'ok');
  assert.equal(result.attempts, 1);
});

test('callWithRetry retries only transient failures, then succeeds', async () => {
  let calls = 0;
  const transport = async () => {
    calls++;
    if (calls < 3) {
      const err = new Error('rate limited');
      err.statusCode = 429;
      throw err;
    }
    return { choices: [{ message: { content: 'recovered' } }] };
  };
  const result = await callWithRetry(transport, {}, { retryCount: 5, delayFn: async () => {} });
  assert.equal(result.content, 'recovered');
  assert.equal(result.attempts, 3);
});

test('callWithRetry does not retry a non-transient failure', async () => {
  let calls = 0;
  const transport = async () => {
    calls++;
    const err = new Error('bad request');
    err.statusCode = 400;
    throw err;
  };
  await assert.rejects(() => callWithRetry(transport, {}, { retryCount: 5, delayFn: async () => {} }));
  assert.equal(calls, 1);
});

test('callWithRetry gives up after exhausting the configured retry count', async () => {
  let calls = 0;
  const transport = async () => {
    calls++;
    const err = new Error('still failing');
    err.statusCode = 503;
    throw err;
  };
  await assert.rejects(() => callWithRetry(transport, {}, { retryCount: 2, delayFn: async () => {} }));
  assert.equal(calls, 2);
});
