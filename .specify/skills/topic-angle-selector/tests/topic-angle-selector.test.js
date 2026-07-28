'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { selectTopicAndMode } = require('../scripts/topic-angle-selector');

const config = {
  topics: ['Topic A', 'Topic B', 'Topic C'],
  multiPerspectiveFormatMarker: 'multi-perspective-source-analysis'
};

test('standard format selects generationMode standard and an eligible topic', () => {
  const result = selectTopicAndMode({
    context: { selectedFormat: 'policy-update', selectedLeadAngle: 'Unobvious', avoidedTopics: [] },
    config
  });
  assert.equal(result.rejected, false);
  assert.equal(result.generationMode, 'standard');
  assert.equal(result.topic, 'Topic A');
  assert.equal(result.leadAngle, 'Unobvious');
});

test('avoided topics are excluded from selection', () => {
  const result = selectTopicAndMode({
    context: { selectedFormat: 'policy-update', selectedLeadAngle: 'Unobvious', avoidedTopics: ['Topic A'] },
    config
  });
  assert.equal(result.topic, 'Topic B');
});

test('when every topic is avoided, falls back to the full list rather than failing', () => {
  const result = selectTopicAndMode({
    context: {
      selectedFormat: 'policy-update',
      selectedLeadAngle: 'Unobvious',
      avoidedTopics: ['Topic A', 'Topic B', 'Topic C']
    },
    config
  });
  assert.equal(result.rejected, false);
  assert.ok(config.topics.includes(result.topic));
});

test('deterministic seed produces the same topic across calls', () => {
  const ctx = { selectedFormat: 'policy-update', selectedLeadAngle: 'Unobvious', avoidedTopics: [] };
  const a = selectTopicAndMode({ context: ctx, config, seed: 'seed-123' });
  const b = selectTopicAndMode({ context: ctx, config, seed: 'seed-123' });
  assert.equal(a.topic, b.topic);
});

test('multi-perspective format with a usable source article sets generationMode multiPerspective', () => {
  const result = selectTopicAndMode({
    context: {
      selectedFormat: 'multi-perspective-source-analysis',
      selectedLeadAngle: 'Innovative',
      avoidedTopics: [],
      normalizedSourceArticle: { title: 't', url: 'u', content: 'c', usable: true }
    },
    config
  });
  assert.equal(result.rejected, false);
  assert.equal(result.generationMode, 'multiPerspective');
});

test('multi-perspective format with an unusable source article is rejected, not silently proceeding with blank context', () => {
  const result = selectTopicAndMode({
    context: {
      selectedFormat: 'multi-perspective-source-analysis',
      selectedLeadAngle: 'Innovative',
      avoidedTopics: [],
      normalizedSourceArticle: { title: '', url: '', content: '', usable: false }
    },
    config
  });
  assert.equal(result.rejected, true);
  assert.equal(result.reason, 'source-unusable');
});

test('throws when config.topics is missing (fail fast)', () => {
  assert.throws(() =>
    selectTopicAndMode({
      context: { selectedFormat: 'policy-update' },
      config: { multiPerspectiveFormatMarker: 'x' }
    })
  );
});
