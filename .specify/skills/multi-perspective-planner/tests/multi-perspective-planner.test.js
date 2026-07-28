'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { planMultiPerspectiveRequests } = require('../scripts/multi-perspective-planner');

const usableSource = { title: 'Source', url: 'https://example.com/a', content: 'content', usable: true };

test('produces exactly 3 requests for Executive, Engineering, Compliance', () => {
  const requests = planMultiPerspectiveRequests({
    groupId: 'group-1',
    topic: 'CMMC audit readiness',
    leadAngle: 'Unobvious',
    avoidTopics: [],
    recentHeadlines: [],
    sourceArticle: usableSource
  });
  assert.equal(requests.length, 3);
  assert.deepEqual(
    requests.map((r) => r.perspective),
    ['Executive', 'Engineering', 'Compliance']
  );
});

test('all 3 requests share one group id and the same source reference', () => {
  const requests = planMultiPerspectiveRequests({
    groupId: 'group-42',
    topic: 'CMMC audit readiness',
    leadAngle: 'Unobvious',
    sourceArticle: usableSource
  });
  requests.forEach((r) => {
    assert.equal(r.groupId, 'group-42');
    assert.equal(r.sourceReference, usableSource);
  });
});

test('each request has distinct, non-empty perspective instructions', () => {
  const requests = planMultiPerspectiveRequests({
    groupId: 'group-1',
    topic: 'topic',
    leadAngle: 'Innovative',
    sourceArticle: usableSource
  });
  const instructions = requests.map((r) => r.perspectiveInstructions);
  assert.equal(new Set(instructions).size, 3);
  instructions.forEach((i) => assert.ok(i.length > 0));
});

test('throws when sourceArticle is not usable', () => {
  assert.throws(() =>
    planMultiPerspectiveRequests({
      groupId: 'group-1',
      topic: 'topic',
      leadAngle: 'Innovative',
      sourceArticle: { title: '', url: '', content: '', usable: false }
    })
  );
});

test('throws when groupId is missing', () => {
  assert.throws(() =>
    planMultiPerspectiveRequests({ topic: 'topic', leadAngle: 'Innovative', sourceArticle: usableSource })
  );
});

test('does not reference legacy Federal Architect branding in any instruction text', () => {
  const requests = planMultiPerspectiveRequests({
    groupId: 'group-1',
    topic: 'topic',
    leadAngle: 'Innovative',
    sourceArticle: usableSource
  });
  requests.forEach((r) => {
    assert.ok(!r.format.toLowerCase().includes('federalarchitect'));
    assert.ok(!r.perspectiveInstructions.toLowerCase().includes('federalarchitect'));
  });
});
