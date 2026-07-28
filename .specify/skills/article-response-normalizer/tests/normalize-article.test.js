'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeArticleResponse, asArray, countParagraphWords } = require('../scripts/normalize-article');

function validArticleJson(overrides = {}) {
  return JSON.stringify(
    Object.assign(
      {
        headline: 'A Real Headline About CMMC',
        slug: 'a-real-headline',
        section: 'compliance',
        kicker: 'CMMC Update',
        subtitle: 'This is a thirty to forty word subtitle written as one or two full sentences distinct from the dek and kicker text for testing purposes only today.',
        dek: 'A short one sentence deck.',
        byline: 'Jane Analyst',
        date: '2026-07-28',
        readMinutes: 3,
        body: [
          { type: 'p', text: 'word '.repeat(25).trim() },
          { type: 'h2', text: 'Section one' },
          { type: 'p', text: 'word '.repeat(25).trim() },
          { type: 'stat', value: '42%', label: 'of contractors' },
          { type: 'h2', text: 'Section two' },
          { type: 'p', text: 'word '.repeat(25).trim() },
          { type: 'pullquote', text: 'A memorable line.' },
          { type: 'p', text: 'word '.repeat(25).trim() },
          { type: 'callout', text: 'Key takeaway.' }
        ],
        altTitles: ['Alt 1', 'Alt 2', 'Alt 3', 'Alt 4', 'Alt 5'],
        linkedinPost: 'x'.repeat(60),
        newsletterSummary: 'x'.repeat(40),
        suggestedDiagrams: ['A diagram idea'],
        followOnIdeas: ['Idea 1', 'Idea 2', 'Idea 3', 'Idea 4', 'Idea 5']
      },
      overrides
    )
  );
}

test('parses and normalizes a fully valid article response', () => {
  const result = normalizeArticleResponse(validArticleJson());
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.article.headline, 'A Real Headline About CMMC');
  assert.equal(result.article.bodyWordCount, 100); // 4 paragraphs * 25 words
});

test('rejects a non-JSON response with a clear error, not partial recovery', () => {
  const result = normalizeArticleResponse('not json at all {{{');
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'invalid_json');
  assert.equal(result.article, null);
});

test('reports a missing subtitle as an independent error, never backfilled from dek', () => {
  const raw = JSON.parse(validArticleJson());
  delete raw.subtitle;
  const result = normalizeArticleResponse(JSON.stringify(raw));
  assert.equal(result.valid, false);
  const subtitleError = result.errors.find((e) => e.field === 'subtitle');
  assert.ok(subtitleError);
  assert.equal(result.article.subtitle, '');
  assert.notEqual(result.article.subtitle, result.article.dek);
});

test('normalizes alternative field names for companion assets', () => {
  const raw = JSON.parse(validArticleJson());
  delete raw.altTitles;
  raw.alternativeTitles = ['A', 'B'];
  delete raw.linkedinPost;
  raw.linkedInPost = 'y'.repeat(60);
  const result = normalizeArticleResponse(JSON.stringify(raw));
  assert.deepEqual(result.article.altTitles, ['A', 'B']);
  assert.equal(result.article.linkedinPost, 'y'.repeat(60));
});

test('normalizes a pipe/newline-separated string field into an array', () => {
  assert.deepEqual(asArray('Idea one | Idea two | Idea three'), ['Idea one', 'Idea two', 'Idea three']);
  assert.deepEqual(asArray('Idea one\nIdea two'), ['Idea one', 'Idea two']);
  assert.deepEqual(asArray(['already', 'array']), ['already', 'array']);
  assert.deepEqual(asArray(undefined), []);
});

test('calculates paragraph-only word count from p blocks, ignoring headings/stats/quotes', () => {
  const body = [
    { type: 'p', text: 'one two three four five' },
    { type: 'h2', text: 'this heading text must not count toward the total at all' },
    { type: 'p', text: 'six seven eight nine ten' }
  ];
  assert.equal(countParagraphWords(body), 10);
});

test('flags a mismatch between LLM-reported bodyWordCount and the calculated value as a non-fatal warning', () => {
  const raw = JSON.parse(validArticleJson());
  raw.bodyWordCount = 999;
  const result = normalizeArticleResponse(JSON.stringify(raw));
  assert.equal(result.valid, true); // still valid — the calculated value is authoritative
  assert.equal(result.article.bodyWordCount, 100);
  const mismatch = result.errors.find((e) => e.code === 'body_word_count_mismatch');
  assert.ok(mismatch);
  assert.equal(mismatch.severity, 'warning');
});

test('rejects an empty body array', () => {
  const raw = JSON.parse(validArticleJson());
  raw.body = [];
  const result = normalizeArticleResponse(JSON.stringify(raw));
  assert.equal(result.valid, false);
  assert.ok(result.errors.find((e) => e.code === 'empty_body'));
});

test('rejects a JSON array or primitive as an invalid shape', () => {
  const result = normalizeArticleResponse('[1,2,3]');
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'invalid_shape');
});
