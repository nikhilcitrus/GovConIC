'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLogEvent, scrubSecrets, REQUIRED_STATUSES } = require('../scripts/reporter');

test('all 9 required statuses are accepted', () => {
  REQUIRED_STATUSES.forEach((status) => {
    const event = createLogEvent({ runId: 'run-1', stage: 'test', status });
    assert.equal(event.status, status);
  });
});

test('an unknown status is rejected', () => {
  assert.throws(() => createLogEvent({ runId: 'run-1', stage: 'test', status: 'bogus_status' }));
});

test('requires runId and stage', () => {
  assert.throws(() => createLogEvent({ stage: 'test', status: 'selected' }));
  assert.throws(() => createLogEvent({ runId: 'run-1', status: 'selected' }));
});

test('includes runId, articleId, groupId, stage, duration, retryCount, and status', () => {
  const event = createLogEvent({
    runId: 'run-1',
    articleId: 'article-1',
    groupId: 'group-1',
    stage: 'oat-validation',
    status: 'oat_failed',
    durationMs: 120,
    retryCount: 2,
    failureCode: 'wrong_paragraph_count'
  });
  assert.equal(event.runId, 'run-1');
  assert.equal(event.articleId, 'article-1');
  assert.equal(event.groupId, 'group-1');
  assert.equal(event.durationMs, 120);
  assert.equal(event.retryCount, 2);
  assert.equal(event.failureCode, 'wrong_paragraph_count');
});

test('scrubs a Groq-shaped API key from a message', () => {
  const event = createLogEvent({
    runId: 'run-1',
    stage: 'llm-call',
    status: 'generated',
    message: 'Authorization: Bearer gsk_SYNTHETICTESTKEYNOTAREALCREDENTIAL0000 succeeded',
    includeSensitiveContent: true
  });
  assert.ok(!event.message.includes('gsk_'));
  assert.ok(event.message.includes('[REDACTED]'));
});

test('scrubs password/authorization/api-key key-value patterns', () => {
  assert.ok(!scrubSecrets('password: hunter2').includes('hunter2'));
  assert.ok(!scrubSecrets('"api_key": "abc123"').includes('abc123'));
  assert.ok(!scrubSecrets('authorization: Bearer xyz').includes('xyz'));
});

test('without includeSensitiveContent, message is truncated to 300 characters by default', () => {
  const longMessage = 'x'.repeat(1000);
  const event = createLogEvent({ runId: 'run-1', stage: 'test', status: 'generated', message: longMessage });
  assert.ok(event.message.length <= 300);
});

test('every event includes an ISO timestamp', () => {
  const event = createLogEvent({ runId: 'run-1', stage: 'test', status: 'selected' });
  assert.ok(!Number.isNaN(Date.parse(event.timestamp)));
});
