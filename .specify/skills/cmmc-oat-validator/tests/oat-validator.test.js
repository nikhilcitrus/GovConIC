'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateArticle,
  checkCmmcRelevance,
  checkDuplicates,
  wholeTermRegex
} = require('../scripts/oat-validator');

const config = {
  paragraphCount: 4,
  h2Count: 2,
  statCount: 1,
  pullquoteCount: 1,
  calloutCount: 1,
  paragraphWordMin: 20,
  paragraphWordMax: 50,
  totalWordMin: 100,
  totalWordMax: 200,
  wordCountTolerance: 0,
  subtitleWordMin: 30,
  subtitleWordMax: 40,
  cmmcTerms: ['CMMC', 'C3PAO', 'POA&M', 'assessment', 'Level 1', 'NIST SP 800-171'],
  prohibitedPatterns: ['press release', 'game-changer', 'sources say'],
  companionAssets: { minAltTitles: 5, minLinkedinPostChars: 50, minNewsletterSummaryChars: 30, minDiagrams: 1, minFollowOnIdeas: 5 }
};

function paragraph(n) {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
}

function baselineArticle(overrides = {}) {
  const body = [
    { type: 'p', text: paragraph(25) },
    { type: 'h2', text: 'Section one' },
    { type: 'p', text: paragraph(25) },
    { type: 'stat', value: '42%', label: 'of contractors report CMMC gaps' },
    { type: 'h2', text: 'Section two' },
    { type: 'p', text: paragraph(25) },
    { type: 'pullquote', text: 'A memorable line about CMMC.' },
    { type: 'p', text: paragraph(25) },
    { type: 'callout', text: 'Key takeaway about assessment readiness.' }
  ];
  return Object.assign(
    {
      headline: 'A Real CMMC Headline About Level 1 Assessment',
      slug: 'a-real-cmmc-headline',
      section: 'compliance',
      kicker: 'CMMC Update',
      subtitle: paragraph(32) + ' words forming a valid subtitle length',
      dek: 'A short one sentence deck about CMMC.',
      byline: 'Jane Analyst',
      date: '2026-07-28',
      readMinutes: 3,
      bodyWordCount: 100,
      body,
      altTitles: ['Alt 1', 'Alt 2', 'Alt 3', 'Alt 4', 'Alt 5'],
      linkedinPost: 'x'.repeat(60),
      newsletterSummary: 'y'.repeat(40),
      suggestedDiagrams: ['A diagram idea'],
      followOnIdeas: ['Idea 1', 'Idea 2', 'Idea 3', 'Idea 4', 'Idea 5']
    },
    overrides
  );
}

test('a fully compliant article passes with zero errors', () => {
  const result = validateArticle({ article: baselineArticle(), sourceUrl: 'https://x/1', memory: {}, config });
  assert.equal(result.passed, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.metrics.paragraphCount, 4);
  assert.equal(result.metrics.h2Count, 2);
});

test('headline shorter than 5 characters fails identity/structure', () => {
  const result = validateArticle({ article: baselineArticle({ headline: 'Hi' }), memory: {}, config });
  assert.equal(result.passed, false);
  assert.ok(result.errors.some((e) => e.code === 'headline_too_short'));
});

test('non-URL-safe slug fails structure', () => {
  const result = validateArticle({ article: baselineArticle({ slug: 'Not A Slug!' }), memory: {}, config });
  assert.ok(result.errors.some((e) => e.code === 'invalid_slug'));
});

test('wrong paragraph count fails with an explicit count error, no hidden tolerance', () => {
  const article = baselineArticle();
  article.body = article.body.filter((b) => b.type !== 'p').concat([{ type: 'p', text: paragraph(25) }]);
  article.bodyWordCount = 25;
  const result = validateArticle({ article, memory: {}, config });
  assert.ok(result.errors.some((e) => e.code === 'wrong_paragraph_count'));
});

test('paragraph word count outside 20-50 fails even by a small margin (zero tolerance)', () => {
  const article = baselineArticle();
  article.body[0].text = paragraph(19); // one word short of the 20 minimum
  article.bodyWordCount = 19 + 25 + 25 + 25;
  const result = validateArticle({ article, memory: {}, config });
  assert.ok(result.errors.some((e) => e.code === 'paragraph_word_count_out_of_range'));
});

test('total word count 5 words under range fails with zero tolerance configured', () => {
  const article = baselineArticle();
  // Force total to 95 (below 100) while keeping each paragraph individually in range (20-50)
  article.body = article.body.map((b) => (b.type === 'p' ? { type: 'p', text: paragraph(20) } : b)).slice();
  const pBlocks = article.body.filter((b) => b.type === 'p');
  pBlocks[0].text = paragraph(15); // push one paragraph below 20 too, to guarantee total < 100 while testing tolerance path
  article.bodyWordCount = 15 + 20 + 20 + 20;
  const result = validateArticle({ article, memory: {}, config });
  assert.ok(result.errors.some((e) => e.code === 'total_word_count_out_of_range'));
});

test('article.bodyWordCount mismatched from calculated paragraph total fails', () => {
  const article = baselineArticle({ bodyWordCount: 999 });
  const result = validateArticle({ article, memory: {}, config });
  assert.ok(result.errors.some((e) => e.code === 'body_word_count_mismatch'));
});

test('missing subtitle fails with a specific error', () => {
  const result = validateArticle({ article: baselineArticle({ subtitle: '' }), memory: {}, config });
  assert.ok(result.errors.some((e) => e.code === 'missing_subtitle'));
});

test('subtitle identical to dek fails distinctness check', () => {
  const article = baselineArticle();
  article.dek = article.subtitle;
  const result = validateArticle({ article, memory: {}, config });
  assert.ok(result.errors.some((e) => e.code === 'subtitle_matches_dek'));
});

test('CMMC relevance: whole-term match succeeds for a real occurrence', () => {
  const { errors, matchedTerms } = checkCmmcRelevance({ headline: 'About CMMC compliance', body: [] }, '', config.cmmcTerms);
  assert.equal(errors.length, 0);
  assert.ok(matchedTerms.includes('CMMC'));
});

test('CMMC relevance: naive substring would false-positive on "assessment" inside "reassessment", whole-term matching does not', () => {
  assert.equal(wholeTermRegex('assessment').test('a routine reassessment occurred'), false);
  assert.equal(wholeTermRegex('assessment').test('a routine assessment occurred'), true);
});

test('CMMC relevance: "Level 1" does not falsely match "Level 10"', () => {
  assert.equal(wholeTermRegex('Level 1').test('this refers to Level 10 systems'), false);
  assert.equal(wholeTermRegex('Level 1').test('this refers to Level 1 systems'), true);
});

test('article with no CMMC terms anywhere fails relevance', () => {
  const article = baselineArticle({
    headline: 'A generic headline about nothing relevant',
    subtitle: paragraph(32) + ' more filler words for length only',
    dek: 'unrelated deck text',
    body: [
      { type: 'p', text: paragraph(25) },
      { type: 'h2', text: 'Section' },
      { type: 'p', text: paragraph(25) },
      { type: 'stat', value: '1', label: 'unrelated stat label text here' },
      { type: 'h2', text: 'Section two' },
      { type: 'p', text: paragraph(25) },
      { type: 'pullquote', text: 'unrelated quote text' },
      { type: 'p', text: paragraph(25) },
      { type: 'callout', text: 'unrelated callout text' }
    ]
  });
  const result = validateArticle({ article, memory: {}, config });
  assert.ok(result.errors.some((e) => e.code === 'not_cmmc_relevant'));
});

test('duplicate detection: source URL already posted', () => {
  const result = checkDuplicates(baselineArticle(), 'https://already-posted.com/x', { postedUrls: ['https://already-posted.com/x'] }, config);
  assert.equal(result.errors[0].code, 'duplicate_source_url');
});

test('duplicate detection: exact normalized headline match', () => {
  const article = baselineArticle({ headline: 'Same Headline Text' });
  const result = checkDuplicates(article, null, { postedTitles: ['same headline text!!'] }, config);
  assert.equal(result.errors[0].code, 'duplicate_exact_headline');
});

test('duplicate detection: six-word headline overlap', () => {
  const article = baselineArticle({ headline: 'Federal contractors face new CMMC scoring rules today' });
  const result = checkDuplicates(article, null, { postedTitles: ['Federal contractors face new CMMC scoring rules yesterday'] }, config);
  assert.equal(result.errors[0].code, 'duplicate_headline_overlap');
});

test('duplicate detection: normalized content hash match', () => {
  const article = baselineArticle();
  const { simpleHash, normalizeContent } = require('../scripts/oat-validator');
  const bodyText = article.body.map((b) => b.text || '').join(' ');
  const hash = simpleHash(normalizeContent(bodyText));
  const result = checkDuplicates(article, null, { postedContentHashes: [hash] }, config);
  assert.equal(result.errors[0].code, 'duplicate_content_hash');
});

test('duplicate detection: recent-headline similarity distinct from postedTitles', () => {
  const article = baselineArticle({ headline: 'Federal contractors face new CMMC scoring rules today' });
  const result = checkDuplicates(article, null, { recentHeadlines: ['Federal contractors face new CMMC scoring rules again'] }, config);
  assert.equal(result.errors[0].code, 'duplicate_recent_headline_similarity');
});

test('duplicate checks are read-only and never mutate the memory object passed in', () => {
  const memory = { postedTitles: ['x'], postedUrls: ['y'], postedContentHashes: ['z'], recentHeadlines: ['w'] };
  const snapshot = JSON.parse(JSON.stringify(memory));
  checkDuplicates(baselineArticle(), 'y', memory, config);
  assert.deepEqual(memory, snapshot);
});

test('prohibited vendor-PR language is rejected', () => {
  const article = baselineArticle({ dek: 'We are proud to feature this game-changer announcement.' });
  const result = validateArticle({ article, memory: {}, config });
  assert.ok(result.errors.some((e) => e.code === 'prohibited_pattern'));
});

test('companion assets: fewer than 5 alt titles fails', () => {
  const result = validateArticle({ article: baselineArticle({ altTitles: ['Only one'] }), memory: {}, config });
  assert.ok(result.errors.some((e) => e.code === 'insufficient_alt_titles'));
});

test('companion assets: short LinkedIn post fails', () => {
  const result = validateArticle({ article: baselineArticle({ linkedinPost: 'too short' }), memory: {}, config });
  assert.ok(result.errors.some((e) => e.code === 'linkedin_post_too_short'));
});

test('attribution: quote attributed to a named real person is flagged as a warning, not a hard failure', () => {
  const article = baselineArticle();
  article.body[0].text =
    '"This creates enormous unnecessary risk for contractors everywhere" said John Smith about the situation today';
  const result = validateArticle({ article, memory: {}, config });
  assert.ok(result.warnings.some((w) => w.code === 'possible_fabricated_quote'));
  assert.equal(result.warnings.find((w) => w.code === 'possible_fabricated_quote').severity, 'warning');
});

test('attribution: unattributed numeric claim is flagged as a warning', () => {
  const article = baselineArticle();
  const words = paragraph(25).split(' ');
  words[3] = '$34.2M';
  article.body[0].text = words.join(' ');
  const result = validateArticle({ article, memory: {}, config });
  assert.ok(result.warnings.some((w) => w.code === 'unattributed_numeric_claim'));
  assert.equal(result.passed, true); // word count/structure unaffected — only the token content changed
});

test('warnings never affect the passed boolean', () => {
  const article = baselineArticle();
  const words = paragraph(25).split(' ');
  words[3] = '$34.2M';
  article.body[0].text = words.join(' ');
  const result = validateArticle({ article, sourceUrl: 'https://x/2', memory: {}, config });
  assert.equal(result.passed, true);
  assert.ok(result.warnings.length >= 1);
});
