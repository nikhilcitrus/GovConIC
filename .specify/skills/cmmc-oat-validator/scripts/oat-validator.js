'use strict';

const BLOCK_REQUIRED_FIELDS = {
  p: ['text'],
  h2: ['text'],
  h3: ['text'],
  h4: ['text'],
  stat: ['value', 'label'],
  pullquote: ['text'],
  list: ['items'],
  callout: ['text']
};

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wholeTermRegex(term) {
  return new RegExp(`(?<![a-zA-Z0-9])${escapeRegex(term)}(?![a-zA-Z0-9])`, 'i');
}

function normalizeHeadline(headline) {
  return String(headline || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeContent(content) {
  return String(content || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

function sixWordOverlap(normalizedIncoming, normalizedStored) {
  const words = normalizedIncoming.split(' ').filter(Boolean);
  for (let i = 0; i <= words.length - 6; i++) {
    const window = words.slice(i, i + 6).join(' ');
    if (window && normalizedStored.includes(window)) return true;
  }
  return false;
}

function wordCount(text) {
  const trimmed = (text || '').trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}

// --- Category 1: Identity and structure ---
function checkIdentityStructure(article) {
  const errors = [];
  if (!article.headline || article.headline.trim().length < 5) {
    errors.push({ code: 'headline_too_short', message: 'headline must be present and at least 5 characters', field: 'headline' });
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(article.slug || '')) {
    errors.push({ code: 'invalid_slug', message: 'slug must be URL-safe (lowercase, hyphen-separated)', field: 'slug' });
  }
  ['section', 'kicker', 'subtitle', 'dek', 'byline', 'date'].forEach((field) => {
    if (!article[field]) errors.push({ code: 'missing_required_field', message: `Missing required field: ${field}`, field });
  });
  if (!Array.isArray(article.body) || article.body.length === 0) {
    errors.push({ code: 'empty_body', message: 'body must be a non-empty array', field: 'body' });
  } else {
    article.body.forEach((block, index) => {
      const required = BLOCK_REQUIRED_FIELDS[block && block.type];
      if (!required) {
        errors.push({ code: 'invalid_block_structure', message: `Block ${index} has unrecognized type "${block && block.type}"`, field: 'body' });
        return;
      }
      required.forEach((f) => {
        if (block[f] === undefined || block[f] === null || block[f] === '') {
          errors.push({ code: 'invalid_block_structure', message: `Block ${index} (${block.type}) missing required field "${f}"`, field: 'body' });
        }
      });
    });
  }
  return errors;
}

// --- Category 2: Word-count and block-count validation ---
function checkWordAndBlockCounts(article, config) {
  const errors = [];
  const body = Array.isArray(article.body) ? article.body : [];

  const counts = { p: 0, h2: 0, stat: 0, pullquote: 0, callout: 0, list: 0 };
  const paragraphWordCounts = [];
  body.forEach((block) => {
    if (block.type in counts) counts[block.type]++;
    if (block.type === 'p') paragraphWordCounts.push(wordCount(block.text));
  });

  if (counts.p !== config.paragraphCount) {
    errors.push({ code: 'wrong_paragraph_count', message: `Expected exactly ${config.paragraphCount} "p" blocks, found ${counts.p}` });
  }
  if (counts.h2 !== config.h2Count) {
    errors.push({ code: 'wrong_h2_count', message: `Expected exactly ${config.h2Count} "h2" blocks, found ${counts.h2}` });
  }
  if (counts.stat !== config.statCount) {
    errors.push({ code: 'wrong_stat_count', message: `Expected exactly ${config.statCount} "stat" block, found ${counts.stat}` });
  }
  if (counts.pullquote !== config.pullquoteCount) {
    errors.push({ code: 'wrong_pullquote_count', message: `Expected exactly ${config.pullquoteCount} "pullquote" block, found ${counts.pullquote}` });
  }
  if (counts.callout !== config.calloutCount) {
    errors.push({ code: 'wrong_callout_count', message: `Expected exactly ${config.calloutCount} "callout" block, found ${counts.callout}` });
  }

  paragraphWordCounts.forEach((count, i) => {
    if (count < config.paragraphWordMin || count > config.paragraphWordMax) {
      errors.push({
        code: 'paragraph_word_count_out_of_range',
        message: `Paragraph ${i + 1} has ${count} words; expected ${config.paragraphWordMin}-${config.paragraphWordMax}`
      });
    }
  });

  const totalParagraphWords = paragraphWordCounts.reduce((a, b) => a + b, 0);
  const tolerance = typeof config.wordCountTolerance === 'number' ? config.wordCountTolerance : 0;
  const min = config.totalWordMin - tolerance;
  const max = config.totalWordMax + tolerance;
  if (totalParagraphWords < min || totalParagraphWords > max) {
    errors.push({
      code: 'total_word_count_out_of_range',
      message: `Total paragraph word count ${totalParagraphWords} outside required range ${config.totalWordMin}-${config.totalWordMax}` +
        (tolerance ? ` (tolerance ${tolerance})` : '')
    });
  }

  if (article.bodyWordCount !== totalParagraphWords) {
    errors.push({
      code: 'body_word_count_mismatch',
      message: `article.bodyWordCount (${article.bodyWordCount}) must equal the validator's calculated paragraph-only count (${totalParagraphWords})`
    });
  }

  return { errors, metrics: { paragraphCount: counts.p, h2Count: counts.h2, statCount: counts.stat, pullquoteCount: counts.pullquote, calloutCount: counts.callout, paragraphWordCount: totalParagraphWords } };
}

// --- Category 3: Subtitle validation ---
function checkSubtitle(article, config) {
  const errors = [];
  if (!article.subtitle || !article.subtitle.trim()) {
    errors.push({ code: 'missing_subtitle', message: 'subtitle is mandatory', field: 'subtitle' });
    return errors;
  }
  const words = wordCount(article.subtitle);
  if (words < config.subtitleWordMin || words > config.subtitleWordMax) {
    errors.push({
      code: 'subtitle_word_count_out_of_range',
      message: `subtitle has ${words} words; expected ${config.subtitleWordMin}-${config.subtitleWordMax}`,
      field: 'subtitle'
    });
  }
  if (article.subtitle.trim() === (article.dek || '').trim()) {
    errors.push({ code: 'subtitle_matches_dek', message: 'subtitle must be different from dek', field: 'subtitle' });
  }
  if (article.subtitle.trim() === (article.kicker || '').trim()) {
    errors.push({ code: 'subtitle_matches_kicker', message: 'subtitle must be different from kicker', field: 'subtitle' });
  }
  return errors;
}

// --- Category 4: CMMC relevance ---
function checkCmmcRelevance(article, topicContext, cmmcTerms) {
  const searchable = [article.headline, article.subtitle, article.dek, topicContext]
    .concat((article.body || []).filter((b) => b.text).map((b) => b.text))
    .join(' ');
  const matched = (cmmcTerms || []).filter((term) => wholeTermRegex(term).test(searchable));
  if (matched.length === 0) {
    return { errors: [{ code: 'not_cmmc_relevant', message: 'No approved CMMC term found in headline, subtitle, dek, body, or topic context' }], matchedTerms: [] };
  }
  return { errors: [], matchedTerms: matched };
}

// --- Category 5: Duplicate detection (read-only — never mutates caches) ---
function checkDuplicates(article, sourceUrl, memory, config) {
  const m = memory || {};
  const normalizedIncoming = normalizeHeadline(article.headline);
  const normalizedBody = normalizeContent((article.body || []).map((b) => b.text || '').join(' '));
  const contentHash = simpleHash(normalizedBody);

  if (sourceUrl && Array.isArray(m.postedUrls) && m.postedUrls.includes(sourceUrl)) {
    return { errors: [{ code: 'duplicate_source_url', message: `Source URL already posted: ${sourceUrl}` }] };
  }

  for (const stored of m.postedTitles || []) {
    if (normalizeHeadline(stored) === normalizedIncoming) {
      return { errors: [{ code: 'duplicate_exact_headline', message: `Headline exactly matches a previously posted title: "${stored}"` }] };
    }
  }

  for (const stored of m.postedTitles || []) {
    if (sixWordOverlap(normalizedIncoming, normalizeHeadline(stored))) {
      return { errors: [{ code: 'duplicate_headline_overlap', message: `Headline overlaps 6+ consecutive words with a previously posted title: "${stored}"` }] };
    }
  }

  if (Array.isArray(m.postedContentHashes) && m.postedContentHashes.includes(contentHash)) {
    return { errors: [{ code: 'duplicate_content_hash', message: 'Normalized content hash matches a previously posted article' }] };
  }

  for (const headline of m.recentHeadlines || []) {
    if (sixWordOverlap(normalizedIncoming, normalizeHeadline(headline))) {
      return { errors: [{ code: 'duplicate_recent_headline_similarity', message: `Headline overlaps with a recent headline: "${headline}"` }] };
    }
  }

  return { errors: [] };
}

// --- Category 6: Prohibited content patterns ---
function checkProhibitedPatterns(article, prohibitedPatterns) {
  const searchable = [article.headline, article.dek, article.subtitle]
    .concat((article.body || []).filter((b) => b.text).map((b) => b.text))
    .join(' ')
    .toLowerCase();
  const matched = (prohibitedPatterns || []).filter((pattern) => searchable.includes(pattern.toLowerCase()));
  if (matched.length > 0) {
    return { errors: matched.map((p) => ({ code: 'prohibited_pattern', message: `Matched prohibited pattern: "${p}"` })) };
  }
  return { errors: [] };
}

// --- Category 7: Companion assets ---
function checkCompanionAssets(article, limits) {
  const errors = [];
  if ((article.altTitles || []).length < limits.minAltTitles) {
    errors.push({ code: 'insufficient_alt_titles', message: `Expected at least ${limits.minAltTitles} alternative titles, found ${(article.altTitles || []).length}` });
  }
  if ((article.linkedinPost || '').length < limits.minLinkedinPostChars) {
    errors.push({ code: 'linkedin_post_too_short', message: `linkedinPost must be at least ${limits.minLinkedinPostChars} characters` });
  }
  if ((article.newsletterSummary || '').length < limits.minNewsletterSummaryChars) {
    errors.push({ code: 'newsletter_summary_too_short', message: `newsletterSummary must be at least ${limits.minNewsletterSummaryChars} characters` });
  }
  if ((article.suggestedDiagrams || []).length < limits.minDiagrams) {
    errors.push({ code: 'insufficient_diagrams', message: `Expected at least ${limits.minDiagrams} suggested diagram(s)` });
  }
  if ((article.followOnIdeas || []).length < limits.minFollowOnIdeas) {
    errors.push({ code: 'insufficient_follow_on_ideas', message: `Expected at least ${limits.minFollowOnIdeas} follow-on ideas, found ${(article.followOnIdeas || []).length}` });
  }
  return errors;
}

// --- Category 8: Attribution and evidence (warnings, not hard failures) ---
const QUOTE_ATTRIBUTION_RE = /"[^"]{10,}"\s*[-—,]?\s*(?:said|stated|noted|explained)\s+([A-Z][a-z]+\s[A-Z][a-z]+)/g;
const NUMERIC_CLAIM_RE = /(\$[\d,.]+[MBK]?)|\b(\d+%|\d+x)\b/g;
const ATTRIBUTION_MARKERS = ['per ', 'according to', 'source:', 'report', 'advisory', 'study'];
const CITATION_RE = /according to [^.]{1,80}/gi;

function checkAttributionEvidence(article) {
  const warnings = [];
  const bodyText = (article.body || []).filter((b) => b.text).map((b) => b.text).join(' ');

  let match;
  QUOTE_ATTRIBUTION_RE.lastIndex = 0;
  while ((match = QUOTE_ATTRIBUTION_RE.exec(bodyText)) !== null) {
    warnings.push({
      code: 'possible_fabricated_quote',
      message: `Quote attributed to a specific named person ("${match[1]}") — verify this is not a fabricated attribution`,
      severity: 'warning'
    });
  }

  NUMERIC_CLAIM_RE.lastIndex = 0;
  while ((match = NUMERIC_CLAIM_RE.exec(bodyText)) !== null) {
    const windowStart = Math.max(0, match.index - 60);
    const window = bodyText.slice(windowStart, match.index + match[0].length + 20).toLowerCase();
    const hasAttribution = ATTRIBUTION_MARKERS.some((marker) => window.includes(marker));
    if (!hasAttribution) {
      warnings.push({
        code: 'unattributed_numeric_claim',
        message: `Numeric claim "${match[0]}" lacks inline source attribution nearby`,
        severity: 'warning'
      });
    }
  }

  CITATION_RE.lastIndex = 0;
  while ((match = CITATION_RE.exec(bodyText)) !== null) {
    warnings.push({
      code: 'unverifiable_citation',
      message: `Citation-style phrase flagged for human review: "${match[0]}"`,
      severity: 'warning'
    });
  }

  return warnings;
}

/**
 * @param {object} params
 * @param {object} params.article - normalized Article
 * @param {string} [params.sourceUrl]
 * @param {string} [params.topicContext]
 * @param {object} params.memory - { postedUrls, postedTitles, postedContentHashes, recentHeadlines } — READ ONLY
 * @param {object} params.config - validation-config.json contents
 * @returns {{passed: boolean, errors: Array, warnings: Array, metrics: object, normalizedArticle: object}}
 */
function validateArticle(params) {
  const { article, sourceUrl, topicContext, memory, config } = params;

  const identityErrors = checkIdentityStructure(article);
  const wordBlock = checkWordAndBlockCounts(article, config);
  const subtitleErrors = checkSubtitle(article, config);
  const relevance = checkCmmcRelevance(article, topicContext, config.cmmcTerms);
  const duplicate = checkDuplicates(article, sourceUrl, memory, config);
  const prohibited = checkProhibitedPatterns(article, config.prohibitedPatterns);
  const companionErrors = checkCompanionAssets(article, config.companionAssets);
  const warnings = checkAttributionEvidence(article);

  const errors = [
    ...identityErrors,
    ...wordBlock.errors,
    ...subtitleErrors,
    ...relevance.errors,
    ...duplicate.errors,
    ...prohibited.errors,
    ...companionErrors
  ];

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    metrics: Object.assign({}, wordBlock.metrics, { matchedCmmcTerms: relevance.matchedTerms }),
    normalizedArticle: article
  };
}

module.exports = {
  validateArticle,
  checkIdentityStructure,
  checkWordAndBlockCounts,
  checkSubtitle,
  checkCmmcRelevance,
  checkDuplicates,
  checkProhibitedPatterns,
  checkCompanionAssets,
  checkAttributionEvidence,
  wholeTermRegex,
  normalizeHeadline,
  normalizeContent,
  simpleHash,
  sixWordOverlap
};
