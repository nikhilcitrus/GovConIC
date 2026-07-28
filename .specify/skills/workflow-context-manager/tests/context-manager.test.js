'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorkflowContext, trimToLimit, deterministicIndex } = require('../scripts/context-manager');

const baseConfig = {
  formats: ['formatA', 'formatB', 'formatC'],
  leadAngles: ['Unobvious', 'Under the Radar', 'Innovative'],
  avoidedBaselineTopics: ['baseline topic 1'],
  cacheLimits: { recentHeadlines: 3, pendingFollowOnTopics: 3, duplicateHistory: 10 }
};

test('rotation advances format and lead-angle index by one each call', () => {
  const memory = { formatRotationIndex: 0, leadAngleRotationIndex: 0 };
  const first = loadWorkflowContext({ memory, config: baseConfig, runId: 'run-1' });
  assert.equal(first.context.selectedFormat, 'formatA');
  assert.equal(first.context.selectedLeadAngle, 'Unobvious');
  assert.equal(first.updatedMemory.formatRotationIndex, 1);

  const second = loadWorkflowContext({ memory: first.updatedMemory, config: baseConfig, runId: 'run-2' });
  assert.equal(second.context.selectedFormat, 'formatB');
  assert.equal(second.context.selectedLeadAngle, 'Under the Radar');
});

test('rotation wraps around after reaching the end of the list', () => {
  const memory = { formatRotationIndex: 2, leadAngleRotationIndex: 2 };
  const result = loadWorkflowContext({ memory, config: baseConfig, runId: 'run-3' });
  assert.equal(result.context.selectedFormat, 'formatC');
  assert.equal(result.updatedMemory.formatRotationIndex, 0);
});

test('seeded selection is deterministic and does not mutate rotation state', () => {
  const memory = { formatRotationIndex: 1, leadAngleRotationIndex: 1 };
  const a = loadWorkflowContext({ memory, config: baseConfig, runId: 'run-4', seed: 'fixed-seed' });
  const b = loadWorkflowContext({ memory, config: baseConfig, runId: 'run-5', seed: 'fixed-seed' });
  assert.equal(a.context.selectedFormat, b.context.selectedFormat);
  assert.equal(a.context.selectedLeadAngle, b.context.selectedLeadAngle);
  assert.equal(a.updatedMemory.formatRotationIndex, memory.formatRotationIndex);
});

test('avoidedTopics combines configured baseline topics with pending follow-on topics', () => {
  const memory = { pendingFollowOnTopics: ['follow-on A', 'follow-on B'] };
  const result = loadWorkflowContext({ memory, config: baseConfig, runId: 'run-6' });
  assert.deepEqual(result.context.avoidedTopics, ['baseline topic 1', 'follow-on A', 'follow-on B']);
});

test('recentHeadlines is trimmed to the configured cache limit', () => {
  const memory = { recentHeadlines: ['h1', 'h2', 'h3', 'h4', 'h5'] };
  const result = loadWorkflowContext({ memory, config: baseConfig, runId: 'run-7' });
  assert.deepEqual(result.context.recentHeadlines, ['h3', 'h4', 'h5']);
});

test('normalizedSourceArticle marks unusable when title/content missing', () => {
  const result = loadWorkflowContext({
    memory: {},
    config: baseConfig,
    runId: 'run-8',
    incomingSourceArticle: { title: '', content: '' }
  });
  assert.equal(result.context.normalizedSourceArticle.usable, false);
});

test('normalizedSourceArticle is null when no source article is supplied', () => {
  const result = loadWorkflowContext({ memory: {}, config: baseConfig, runId: 'run-9' });
  assert.equal(result.context.normalizedSourceArticle, null);
});

test('throws when required config is missing (fail fast)', () => {
  assert.throws(() => loadWorkflowContext({ memory: {}, config: { leadAngles: ['x'] }, runId: 'run-10' }));
  assert.throws(() => loadWorkflowContext({ memory: {}, config: { formats: ['x'] }, runId: 'run-11' }));
});

test('trimToLimit and deterministicIndex helpers behave correctly', () => {
  assert.deepEqual(trimToLimit(['a', 'b', 'c'], 2), ['b', 'c']);
  assert.deepEqual(trimToLimit(['a'], 5), ['a']);
  assert.equal(typeof deterministicIndex('seed', 5), 'number');
  assert.equal(deterministicIndex('seed', 5), deterministicIndex('seed', 5));
});
