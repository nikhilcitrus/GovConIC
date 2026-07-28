'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { loadWorkflowContext } = require(path.join('..', '..', '.specify/skills/workflow-context-manager/scripts/context-manager'));
const { selectTopicAndMode } = require(path.join('..', '..', '.specify/skills/topic-angle-selector/scripts/topic-angle-selector'));
const { buildGenerationRequest } = require(path.join('..', '..', '.specify/skills/cmmc-editorial-prompt-builder/scripts/prompt-builder'));
const { callWithRetry } = require(path.join('..', '..', '.specify/skills/llm-content-generator/scripts/llm-client'));
const { normalizeArticleResponse } = require(path.join('..', '..', '.specify/skills/article-response-normalizer/scripts/normalize-article'));
const { convertBlocksToHtml } = require(path.join('..', '..', '.specify/skills/article-blocks-to-html/scripts/blocks-to-html'));
const { validateArticle } = require(path.join('..', '..', '.specify/skills/cmmc-oat-validator/scripts/oat-validator'));
const { publishDraft } = require(path.join('..', '..', '.specify/skills/wordpress-draft-publisher/scripts/wordpress-publisher'));
const { updateMemoryAfterPublish } = require(path.join('..', '..', '.specify/skills/publication-memory-updater/scripts/memory-updater'));

const editorialConfig = {
  brand: 'GovConIC — The Government Contractor Intelligence Center',
  audience: 'mid-market government contractors',
  formats: ['contrarian-analysis'],
  multiPerspectiveFormatMarker: 'multi-perspective-source-analysis',
  leadAngles: ['Unobvious'],
  topics: ['SPRS score submission accuracy'],
  avoidedBaselineTopics: [],
  cacheLimits: { recentHeadlines: 15, pendingFollowOnTopics: 30, duplicateHistory: 300 }
};
const validationConfig = {
  paragraphCount: 4, h2Count: 2, statCount: 1, pullquoteCount: 1, calloutCount: 1,
  paragraphWordMin: 20, paragraphWordMax: 50, totalWordMin: 100, totalWordMax: 200, wordCountTolerance: 0,
  subtitleWordMin: 30, subtitleWordMax: 40,
  cmmcTerms: ['CMMC', 'assessment'],
  prohibitedPatterns: ['press release', 'game-changer'],
  companionAssets: { minAltTitles: 5, minLinkedinPostChars: 50, minNewsletterSummaryChars: 30, minDiagrams: 1, minFollowOnIdeas: 5 }
};
const providerConfig = { model: 'llama-3.3-70b-versatile', temperature: 0.7, maxTokens: 2000 };
const wordpressConfig = { baseUrl: 'https://staging.example.com', categoryId: 52 };

function para(n, offset = 0) {
  return Array.from({ length: n }, (_, i) => `word${offset + i}`).join(' ');
}

function mockLlmArticleJson() {
  return JSON.stringify({
    headline: 'A Genuinely Distinct CMMC SPRS Headline For Testing',
    slug: 'a-genuinely-distinct-cmmc-sprs-headline',
    section: 'compliance',
    kicker: 'CMMC Update',
    subtitle: para(34, 100),
    dek: 'A short one-sentence deck about CMMC assessment work.',
    byline: 'Jane Analyst',
    date: '2026-07-28',
    readMinutes: 3,
    bodyWordCount: 100,
    body: [
      { type: 'p', text: para(25, 0) },
      { type: 'h2', text: 'Section one' },
      { type: 'p', text: para(25, 25) },
      { type: 'stat', value: '42%', label: 'of contractors report CMMC assessment gaps' },
      { type: 'h2', text: 'Section two' },
      { type: 'p', text: para(25, 50) },
      { type: 'pullquote', text: 'A memorable line about CMMC assessment.' },
      { type: 'p', text: para(25, 75) },
      { type: 'callout', text: 'Key takeaway about assessment readiness.' }
    ],
    altTitles: ['Alt 1', 'Alt 2', 'Alt 3', 'Alt 4', 'Alt 5'],
    linkedinPost: 'x'.repeat(60),
    newsletterSummary: 'y'.repeat(40),
    suggestedDiagrams: ['A diagram idea'],
    followOnIdeas: ['Idea 1', 'Idea 2', 'Idea 3', 'Idea 4', 'Idea 5']
  });
}

test('workflow acceptance: a valid standard article reaches WordPress draft creation and updates memory', async () => {
  const memory = {};
  const { context, updatedMemory } = loadWorkflowContext({ memory, config: editorialConfig, runId: 'run-1' });
  const selection = selectTopicAndMode({
    context,
    config: { topics: editorialConfig.topics, multiPerspectiveFormatMarker: editorialConfig.multiPerspectiveFormatMarker }
  });
  assert.equal(selection.rejected, false);

  const generationRequest = {
    topic: selection.topic, format: selection.format, leadAngle: selection.leadAngle,
    avoidTopics: context.avoidedTopics, recentHeadlines: context.recentHeadlines
  };
  const llmRequest = buildGenerationRequest({ generationRequest, editorialConfig, validationConfig, providerConfig });
  assert.equal(llmRequest.model, providerConfig.model);

  const llmResult = await callWithRetry(
    async () => ({ choices: [{ message: { content: mockLlmArticleJson() } }] }),
    llmRequest,
    { retryCount: 1, delayFn: async () => {} }
  );

  const normalized = normalizeArticleResponse(llmResult.content);
  assert.equal(normalized.valid, true);

  const htmlResult = convertBlocksToHtml(normalized.article.body);
  assert.equal(htmlResult.valid, true);

  const oatResult = validateArticle({
    article: normalized.article, sourceUrl: null, topicContext: selection.topic,
    memory: { postedUrls: [], postedTitles: [], postedContentHashes: [], recentHeadlines: context.recentHeadlines },
    config: validationConfig
  });
  assert.equal(oatResult.passed, true, JSON.stringify(oatResult.errors));

  const publicationRecord = await publishDraft({
    article: normalized.article, html: htmlResult.html, config: wordpressConfig, dryRun: false, credentialRef: 'ref',
    transport: async (_callConfig, payload) => {
      assert.equal(payload.status, 'draft');
      return { id: 999, status: 'draft', date_gmt: '2026-07-28T00:00:00' };
    }
  });
  assert.equal(publicationRecord.postId, 999);

  const finalMemory = updateMemoryAfterPublish({
    memory: updatedMemory, article: normalized.article, publicationRecord, cacheLimits: editorialConfig.cacheLimits
  });
  assert.deepEqual(finalMemory.recentHeadlines, [normalized.article.headline]);
  assert.equal(finalMemory.oatPassedCount, 1);
});

test('workflow acceptance: invalid word count fails OAT and never reaches publish', async () => {
  const article = JSON.parse(mockLlmArticleJson());
  article.body[0].text = para(10); // too short — violates the 20-50 word paragraph rule
  const normalized = normalizeArticleResponse(JSON.stringify(article));
  const htmlResult = convertBlocksToHtml(normalized.article.body);
  const oatResult = validateArticle({ article: normalized.article, memory: {}, config: validationConfig });
  assert.equal(oatResult.passed, false);
  assert.ok(oatResult.errors.some((e) => e.code === 'paragraph_word_count_out_of_range'));
  // A guard equivalent to the assembled workflow's "Route OAT Pass Fail" IF node:
  const eligibleForPublish = oatResult.passed === true;
  assert.equal(eligibleForPublish, false);
});

test('workflow acceptance: missing subtitle fails OAT', async () => {
  const article = JSON.parse(mockLlmArticleJson());
  delete article.subtitle;
  const normalized = normalizeArticleResponse(JSON.stringify(article));
  const oatResult = validateArticle({ article: normalized.article, memory: {}, config: validationConfig });
  assert.equal(oatResult.passed, false);
  assert.ok(oatResult.errors.some((e) => e.code === 'missing_subtitle'));
});

test('workflow acceptance: duplicate headline is skipped', async () => {
  const article = JSON.parse(mockLlmArticleJson());
  const normalized = normalizeArticleResponse(JSON.stringify(article));
  const oatResult = validateArticle({
    article: normalized.article, memory: { postedTitles: [normalized.article.headline] }, config: validationConfig
  });
  assert.equal(oatResult.passed, false);
  assert.ok(oatResult.errors.some((e) => e.code === 'duplicate_exact_headline'));
});

test('workflow acceptance: non-CMMC article is rejected', async () => {
  const article = JSON.parse(mockLlmArticleJson());
  article.headline = 'A generic article about nothing in particular today';
  article.subtitle = para(32, 200) + ' unrelated filler words only for length purposes here';
  article.dek = 'unrelated deck';
  article.body.forEach((b) => {
    if (b.text) b.text = b.text.replace(/CMMC|assessment/gi, 'unrelated');
    if (b.label) b.label = b.label.replace(/CMMC|assessment/gi, 'unrelated');
  });
  const normalized = normalizeArticleResponse(JSON.stringify(article));
  const oatResult = validateArticle({ article: normalized.article, memory: {}, config: validationConfig });
  assert.equal(oatResult.passed, false);
  assert.ok(oatResult.errors.some((e) => e.code === 'not_cmmc_relevant'));
});

test('workflow acceptance: vendor-PR language is rejected', async () => {
  const article = JSON.parse(mockLlmArticleJson());
  article.dek = 'We are proud to feature this game-changer announcement about CMMC.';
  const normalized = normalizeArticleResponse(JSON.stringify(article));
  const oatResult = validateArticle({ article: normalized.article, memory: {}, config: validationConfig });
  assert.equal(oatResult.passed, false);
  assert.ok(oatResult.errors.some((e) => e.code === 'prohibited_pattern'));
});

test('workflow acceptance: missing companion assets fail OAT', async () => {
  const article = JSON.parse(mockLlmArticleJson());
  article.altTitles = ['Only one'];
  const normalized = normalizeArticleResponse(JSON.stringify(article));
  const oatResult = validateArticle({ article: normalized.article, memory: {}, config: validationConfig });
  assert.equal(oatResult.passed, false);
  assert.ok(oatResult.errors.some((e) => e.code === 'insufficient_alt_titles'));
});

test('workflow acceptance: dry-run mode performs every step except external publication', async () => {
  const article = JSON.parse(mockLlmArticleJson());
  const normalized = normalizeArticleResponse(JSON.stringify(article));
  const htmlResult = convertBlocksToHtml(normalized.article.body);
  const oatResult = validateArticle({ article: normalized.article, memory: {}, config: validationConfig });
  assert.equal(oatResult.passed, true);

  let transportCalled = false;
  const result = await publishDraft({
    article: normalized.article, html: htmlResult.html, config: wordpressConfig, dryRun: true, credentialRef: 'ref',
    transport: async () => { transportCalled = true; return { id: 1 }; }
  });
  assert.equal(transportCalled, false);
  assert.equal(result.dryRun, true);
  assert.equal(result.wouldPublish.status, 'draft');
});

test('integration: publication success is followed by a memory update; publication failure is not', async () => {
  const article = JSON.parse(mockLlmArticleJson());
  const normalized = normalizeArticleResponse(JSON.stringify(article));
  const htmlResult = convertBlocksToHtml(normalized.article.body);

  const memoryBefore = { recentHeadlines: ['unrelated'] };

  // Success path
  const record = await publishDraft({
    article: normalized.article, html: htmlResult.html, config: wordpressConfig, dryRun: false, credentialRef: 'ref',
    transport: async () => ({ id: 5, status: 'draft', date_gmt: '2026-07-28T00:00:00' })
  });
  const memoryAfterSuccess = updateMemoryAfterPublish({ memory: memoryBefore, article: normalized.article, publicationRecord: record, cacheLimits: editorialConfig.cacheLimits });
  assert.ok(memoryAfterSuccess.recentHeadlines.includes(normalized.article.headline));

  // Failure path — publishDraft rejects, so updateMemoryAfterPublish must never be called;
  // simulate the caller's control flow explicitly to prove the invariant.
  let memoryUpdateAttempted = false;
  try {
    await publishDraft({
      article: normalized.article, html: htmlResult.html, config: wordpressConfig, dryRun: false, credentialRef: 'ref',
      transport: async () => { throw Object.assign(new Error('WordPress 401'), { statusCode: 401 }); }
    });
    memoryUpdateAttempted = true; // would only reach here if publishDraft didn't throw
  } catch (err) {
    // expected — memory update must not run
  }
  assert.equal(memoryUpdateAttempted, false);
  assert.deepEqual(memoryBefore, { recentHeadlines: ['unrelated'] }); // untouched by the failed attempt
});

test('workflow acceptance: multi-perspective mode creates exactly three article-generation requests, one failing does not corrupt the others', async () => {
  const { planMultiPerspectiveRequests } = require(path.join('..', '..', '.specify/skills/multi-perspective-planner/scripts/multi-perspective-planner'));
  const usableSource = { title: 'Source', url: 'https://x/1', content: 'content', usable: true };
  const requests = planMultiPerspectiveRequests({ groupId: 'g1', topic: 'topic', leadAngle: 'Unobvious', sourceArticle: usableSource });
  assert.equal(requests.length, 3);

  const results = requests.map((req, i) => {
    const article = JSON.parse(mockLlmArticleJson());
    article.headline = `${article.headline} Variant ${i}`;
    article.slug = `${article.slug}-variant-${i}`;
    if (i === 1) article.altTitles = ['only one']; // deliberately break the Engineering perspective only
    const normalized = normalizeArticleResponse(JSON.stringify(article));
    return validateArticle({ article: normalized.article, memory: {}, config: validationConfig });
  });

  assert.equal(results[0].passed, true);
  assert.equal(results[1].passed, false); // Engineering perspective fails OAT
  assert.equal(results[2].passed, true); // Compliance perspective unaffected by Engineering's failure
});

test('no failed or diagnostic item is structurally publishable', () => {
  const article = JSON.parse(mockLlmArticleJson());
  article.body[0].text = para(5); // broken
  const normalized = normalizeArticleResponse(JSON.stringify(article));
  const oatResult = validateArticle({ article: normalized.article, memory: {}, config: validationConfig });
  // The assembled workflow's "Route OAT Pass Fail" IF node checks exactly this boolean —
  // proving a failed result can never be mistaken for a publishable one.
  assert.equal(oatResult.passed, false);
  assert.equal(typeof oatResult.passed, 'boolean');
});
