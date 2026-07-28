'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { updateMemoryAfterPublish, createInMemoryAdapter, appendDedupTrim } = require('../scripts/memory-updater');

const article = {
  headline: 'A Brand New Headline',
  body: [{ type: 'p', text: 'some article body content here' }],
  followOnIdeas: ['Follow-on idea A', 'Follow-on idea B']
};
const publicationRecord = { postId: 123, publishedAt: '2026-07-28T00:00:00.000Z', sourceUrl: 'https://source.example.com/x' };

test('appends the new headline, posted title, posted URL, and content hash', () => {
  const updated = updateMemoryAfterPublish({ memory: {}, article, publicationRecord, cacheLimits: {} });
  assert.deepEqual(updated.recentHeadlines, ['A Brand New Headline']);
  assert.deepEqual(updated.postedTitles, ['A Brand New Headline']);
  assert.deepEqual(updated.postedUrls, ['https://source.example.com/x']);
  assert.equal(updated.postedContentHashes.length, 1);
});

test('appends follow-on ideas to pendingFollowOnTopics without duplicating', () => {
  const memory = { pendingFollowOnTopics: ['Follow-on idea A'] };
  const updated = updateMemoryAfterPublish({ memory, article, publicationRecord, cacheLimits: {} });
  assert.deepEqual(updated.pendingFollowOnTopics, ['Follow-on idea A', 'Follow-on idea B']);
});

test('increments oatPassedCount and sets lastPublicationTimestamp', () => {
  const updated = updateMemoryAfterPublish({ memory: { oatPassedCount: 5 }, article, publicationRecord, cacheLimits: {} });
  assert.equal(updated.oatPassedCount, 6);
  assert.equal(updated.lastPublicationTimestamp, '2026-07-28T00:00:00.000Z');
});

test('does not append a duplicate posted title on repeated calls with the same headline', () => {
  let memory = {};
  memory = updateMemoryAfterPublish({ memory, article, publicationRecord, cacheLimits: {} });
  memory = updateMemoryAfterPublish({ memory, article, publicationRecord: { ...publicationRecord, postId: 124 }, cacheLimits: {} });
  assert.deepEqual(memory.postedTitles, ['A Brand New Headline']);
});

test('enforces cache limits (recentHeadlines default 15, duplicateHistory default 300)', () => {
  let memory = { recentHeadlines: Array.from({ length: 15 }, (_, i) => `old-${i}`) };
  memory = updateMemoryAfterPublish({ memory, article, publicationRecord, cacheLimits: { recentHeadlines: 15 } });
  assert.equal(memory.recentHeadlines.length, 15);
  assert.equal(memory.recentHeadlines[memory.recentHeadlines.length - 1], 'A Brand New Headline');
  assert.equal(memory.recentHeadlines[0], 'old-1'); // oldest ('old-0') was trimmed
});

test('does not update postedUrls when the article has no source URL', () => {
  const updated = updateMemoryAfterPublish({
    memory: {},
    article,
    publicationRecord: { postId: 1, publishedAt: 'x' },
    cacheLimits: {}
  });
  assert.deepEqual(updated.postedUrls, []);
});

test('throws when publicationRecord is missing a postId (i.e. not actually confirmed)', () => {
  assert.throws(() => updateMemoryAfterPublish({ memory: {}, article, publicationRecord: {}, cacheLimits: {} }));
  assert.throws(() => updateMemoryAfterPublish({ memory: {}, article, publicationRecord: null, cacheLimits: {} }));
});

test('appendDedupTrim is a generic, reusable helper', () => {
  assert.deepEqual(appendDedupTrim(['a', 'b'], 'a', 10), ['a', 'b']);
  assert.deepEqual(appendDedupTrim(['a', 'b'], 'c', 2), ['b', 'c']);
});

test('createInMemoryAdapter demonstrates the swappable storage-adapter interface', () => {
  const adapter = createInMemoryAdapter({ recentHeadlines: [] });
  const updated = updateMemoryAfterPublish({ memory: adapter.read(), article, publicationRecord, cacheLimits: {} });
  adapter.write(updated);
  assert.deepEqual(adapter.read().recentHeadlines, ['A Brand New Headline']);
});
