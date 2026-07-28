'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { callWithRetry } = require(path.join('..', '..', '.specify/skills/llm-content-generator/scripts/llm-client'));
const { normalizeArticleResponse } = require(path.join('..', '..', '.specify/skills/article-response-normalizer/scripts/normalize-article'));
const { publishDraft } = require(path.join('..', '..', '.specify/skills/wordpress-draft-publisher/scripts/wordpress-publisher'));

test('mocked Groq success: envelope parses and content flows into the normalizer', async () => {
  const result = await callWithRetry(
    async () => ({ choices: [{ message: { content: '{"headline":"ok"}' } }] }),
    {},
    { retryCount: 1, delayFn: async () => {} }
  );
  const normalized = normalizeArticleResponse(result.content);
  assert.equal(normalized.article.headline, 'ok');
});

test('mocked Groq malformed JSON: normalizer reports invalid_json, not a crash', async () => {
  const result = await callWithRetry(
    async () => ({ choices: [{ message: { content: 'not valid json {{{' } }] }),
    {},
    { retryCount: 1, delayFn: async () => {} }
  );
  const normalized = normalizeArticleResponse(result.content);
  assert.equal(normalized.valid, false);
  assert.equal(normalized.errors[0].code, 'invalid_json');
});

test('mocked Groq timeout: retried as a transient failure, then succeeds', async () => {
  let attempts = 0;
  const result = await callWithRetry(
    async () => {
      attempts++;
      if (attempts < 2) {
        const err = new Error('timed out');
        err.code = 'ETIMEDOUT';
        throw err;
      }
      return { choices: [{ message: { content: '{"headline":"recovered"}' } }] };
    },
    {},
    { retryCount: 3, delayFn: async () => {} }
  );
  assert.equal(attempts, 2);
  assert.equal(result.attempts, 2);
});

test('mocked Groq rate limit (429): retried, then exhausted if it never recovers', async () => {
  let attempts = 0;
  await assert.rejects(() =>
    callWithRetry(
      async () => {
        attempts++;
        const err = new Error('rate limited');
        err.statusCode = 429;
        throw err;
      },
      {},
      { retryCount: 3, delayFn: async () => {} }
    )
  );
  assert.equal(attempts, 3);
});

test('WordPress success', async () => {
  const record = await publishDraft({
    article: { headline: 'H', slug: 's', subtitle: 'sub' },
    html: '<p>x</p>',
    config: { baseUrl: 'https://x.com', categoryId: 52 },
    dryRun: false,
    credentialRef: 'ref',
    transport: async () => ({ id: 1, status: 'draft', date_gmt: '2026-07-28T00:00:00' })
  });
  assert.equal(record.postId, 1);
});

test('WordPress authentication failure surfaces as a rejection, not a silent no-op', async () => {
  await assert.rejects(() =>
    publishDraft({
      article: { headline: 'H', slug: 's', subtitle: 'sub' },
      html: '<p>x</p>',
      config: { baseUrl: 'https://x.com', categoryId: 52 },
      dryRun: false,
      credentialRef: 'ref',
      transport: async () => {
        const err = new Error('Unauthorized');
        err.statusCode = 401;
        throw err;
      }
    })
  );
});

test('WordPress validation failure (malformed response) surfaces as a rejection', async () => {
  await assert.rejects(() =>
    publishDraft({
      article: { headline: 'H', slug: 's', subtitle: 'sub' },
      html: '<p>x</p>',
      config: { baseUrl: 'https://x.com', categoryId: 52 },
      dryRun: false,
      credentialRef: 'ref',
      transport: async () => ({}) // no id — malformed
    })
  );
});
