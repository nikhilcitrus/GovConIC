'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { convertBlocksToHtml, escapeHtml } = require('../scripts/blocks-to-html');

const sampleBody = [
  { type: 'p', text: 'one two three four five' },
  { type: 'h2', text: 'Section Heading' },
  { type: 'p', text: 'six seven eight nine ten' },
  { type: 'stat', value: '42%', label: 'of contractors report this' },
  { type: 'pullquote', text: 'A memorable line.' },
  { type: 'list', items: ['first', 'second'] },
  { type: 'callout', text: 'Key takeaway.' }
];

test('converts each supported block type to its defined HTML mapping, preserving order', () => {
  const result = convertBlocksToHtml(sampleBody);
  assert.equal(result.valid, true);
  const html = result.html;
  assert.ok(html.indexOf('<p>one two three four five</p>') < html.indexOf('<h2>Section Heading</h2>'));
  assert.ok(html.indexOf('<h2>Section Heading</h2>') < html.indexOf('<p>six seven eight nine ten</p>'));
  assert.ok(html.includes('<blockquote>A memorable line.</blockquote>'));
  assert.ok(html.includes('<ul><li>first</li><li>second</li></ul>'));
  assert.ok(html.includes('<div class="callout">Key takeaway.</div>'));
  assert.ok(html.includes('class="stat"'));
});

test('escapes unsafe HTML in block text', () => {
  const result = convertBlocksToHtml([{ type: 'p', text: '<script>alert(1)</script> & "quotes"' }]);
  assert.equal(result.valid, true);
  assert.ok(!result.html.includes('<script>'));
  assert.ok(result.html.includes('&lt;script&gt;'));
  assert.ok(result.html.includes('&amp;'));
  assert.ok(result.html.includes('&quot;quotes&quot;'));
});

test('rejects an unknown block type by default rather than guessing a rendering', () => {
  const result = convertBlocksToHtml([{ type: 'p', text: 'ok' }, { type: 'quote2', foo: 'bar', baz: 'a much longer string that could be mistaken for a body paragraph' }]);
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'unsupported_block_type');
  assert.equal(result.html, null);
});

test('explicit fallback mode renders an unknown block as a labeled, escaped diagnostic element', () => {
  const result = convertBlocksToHtml([{ type: 'quote2', text: 'unexpected <b>type</b>' }], { fallbackMode: true });
  assert.equal(result.valid, true);
  assert.ok(result.html.includes('data-block-type="quote2"'));
  assert.ok(!result.html.includes('<b>type</b>'));
});

test('returns both HTML and plain text', () => {
  const result = convertBlocksToHtml([{ type: 'p', text: 'hello world' }, { type: 'h2', text: 'A Header' }]);
  assert.ok(result.html.includes('<p>hello world</p>'));
  assert.equal(result.plainText, 'hello world A Header');
});

test('paragraph-only word count counts only p blocks', () => {
  const result = convertBlocksToHtml(sampleBody);
  assert.equal(result.paragraphWordCount, 10); // 5 + 5 words across the two p blocks
});

test('full-body word count counts every block, including headings/stats/quotes/lists/callouts', () => {
  const result = convertBlocksToHtml([
    { type: 'p', text: 'one two three' },
    { type: 'h2', text: 'four five' }
  ]);
  assert.equal(result.fullWordCount, 5);
});

test('rejects a non-array body', () => {
  const result = convertBlocksToHtml('not an array');
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'invalid_body');
});

test('rejects a block missing a type', () => {
  const result = convertBlocksToHtml([{ text: 'no type here' }]);
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'invalid_block');
});

test('escapeHtml handles null/undefined gracefully', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});
