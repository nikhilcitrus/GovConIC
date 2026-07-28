'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSourceArticle, sanitizeToPlainText } = require('../scripts/source-extractor');

test('normalizes title and content, preserving the URL', () => {
  const result = extractSourceArticle({
    extracted: { title: 'A Real Headline', content: 'A' + ' word'.repeat(20) },
    url: 'https://example.com/source-article'
  });
  assert.equal(result.title, 'A Real Headline');
  assert.equal(result.url, 'https://example.com/source-article');
  assert.equal(result.usable, true);
});

test('strips script and style tags before producing plain text', () => {
  const html = '<div>Real content <script>alert(1)</script><style>.x{}</style> more text here to pass length</div>';
  const cleaned = sanitizeToPlainText(html);
  assert.ok(!cleaned.includes('alert'));
  assert.ok(!cleaned.includes('<script>'));
  assert.ok(cleaned.includes('Real content'));
});

test('decodes common HTML entities', () => {
  const cleaned = sanitizeToPlainText('Terms &amp; Conditions &mdash; &quot;quoted&quot;'.replace('&mdash;', '-'));
  assert.ok(cleaned.includes('Terms & Conditions'));
});

test('rejects as unusable when title is empty', () => {
  const result = extractSourceArticle({ extracted: { title: '', content: 'plenty of content '.repeat(5) } });
  assert.equal(result.usable, false);
});

test('rejects as unusable when content is below the minimum length', () => {
  const result = extractSourceArticle({ extracted: { title: 'Title', content: 'too short' } });
  assert.equal(result.usable, false);
});

test('rejects as unusable when both title and content are empty', () => {
  const result = extractSourceArticle({ extracted: {} });
  assert.equal(result.usable, false);
  assert.equal(result.title, '');
  assert.equal(result.content, '');
});

test('honors a custom minContentLength threshold', () => {
  const result = extractSourceArticle({
    extracted: { title: 'Title', content: 'short but allowed' },
    minContentLength: 5
  });
  assert.equal(result.usable, true);
});
