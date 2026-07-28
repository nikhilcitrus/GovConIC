'use strict';

const REQUIRED_IDENTITY_FIELDS = [
  'headline',
  'slug',
  'section',
  'kicker',
  'subtitle',
  'dek',
  'byline',
  'date',
  'readMinutes'
];

function asArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    return val
      .split(/\r?\n|\|/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function pickField(data, keys) {
  for (const k of keys) {
    if (data[k] !== undefined && data[k] !== null && data[k] !== '') return data[k];
  }
  return undefined;
}

function countParagraphWords(body) {
  if (!Array.isArray(body)) return 0;
  return body
    .filter((b) => b && b.type === 'p' && typeof b.text === 'string')
    .reduce((total, b) => total + b.text.trim().split(/\s+/).filter(Boolean).length, 0);
}

/**
 * @param {string} rawContent - the raw string from llm-content-generator's `content` output
 * @returns {{valid: boolean, errors: Array<{code:string,message:string,field?:string}>, article: object|null}}
 */
function normalizeArticleResponse(rawContent) {
  const errors = [];
  let parsed;

  try {
    parsed = JSON.parse(rawContent);
  } catch (err) {
    return {
      valid: false,
      errors: [
        {
          code: 'invalid_json',
          message: `Failed to parse LLM response as JSON: ${err.message} | raw: ${String(rawContent).slice(0, 300)}`
        }
      ],
      article: null
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      errors: [{ code: 'invalid_shape', message: 'Parsed LLM response is not a JSON object' }],
      article: null
    };
  }

  const body = Array.isArray(parsed.body)
    ? parsed.body
    : Array.isArray(parsed.content)
      ? parsed.content
      : Array.isArray(parsed.article)
        ? parsed.article
        : Array.isArray(parsed.sections)
          ? parsed.sections
          : [];

  const calculatedBodyWordCount = countParagraphWords(body);

  const article = {
    headline: parsed.headline || '',
    slug: parsed.slug || '',
    section: parsed.section || '',
    kicker: parsed.kicker || '',
    subtitle: parsed.subtitle || '', // never backfilled from dek/kicker — resolves research.md R3/R4
    dek: parsed.dek || '',
    byline: parsed.byline || '',
    date: parsed.date || '',
    readMinutes: typeof parsed.readMinutes === 'number' ? parsed.readMinutes : Number(parsed.readMinutes) || 0,
    bodyWordCount: calculatedBodyWordCount, // always the normalizer's own calculation, never trusted from the LLM (resolves R7)
    body,
    altTitles: asArray(pickField(parsed, ['altTitles', 'alternativeTitles', 'titleOptions', 'titles'])),
    linkedinPost: pickField(parsed, ['linkedinPost', 'linkedInPost', 'linkedin_post']) || '',
    newsletterSummary: pickField(parsed, ['newsletterSummary', 'newsletter_summary', 'digestSummary']) || '',
    suggestedDiagrams: asArray(pickField(parsed, ['suggestedDiagrams', 'diagramIdeas', 'diagrams'])),
    followOnIdeas: asArray(pickField(parsed, ['followOnIdeas', 'followOnArticles', 'relatedArticleIdeas']))
  };

  for (const field of REQUIRED_IDENTITY_FIELDS) {
    const value = article[field];
    const isMissing =
      value === undefined ||
      value === null ||
      value === '' ||
      (field === 'readMinutes' && (!Number.isFinite(value) || value <= 0));
    if (isMissing) {
      errors.push({ code: 'missing_required_field', message: `Missing required field: ${field}`, field });
    }
  }

  if (!Array.isArray(body) || body.length === 0) {
    errors.push({ code: 'empty_body', message: 'Article body must be a non-empty array of content blocks', field: 'body' });
  }

  if (
    parsed.bodyWordCount !== undefined &&
    Number(parsed.bodyWordCount) !== calculatedBodyWordCount
  ) {
    errors.push({
      code: 'body_word_count_mismatch',
      message: `LLM-reported bodyWordCount (${parsed.bodyWordCount}) does not match the calculated paragraph-only word count (${calculatedBodyWordCount}); the calculated value is authoritative`,
      field: 'bodyWordCount'
    });
    // Non-fatal: the normalizer still returns the calculated value as authoritative (see article.bodyWordCount above).
    // This is a warning-grade discrepancy surfaced for observability, not a validity blocker on its own.
    errors[errors.length - 1].severity = 'warning';
  }

  const fatalErrors = errors.filter((e) => e.severity !== 'warning');

  return { valid: fatalErrors.length === 0, errors, article };
}

module.exports = { normalizeArticleResponse, asArray, pickField, countParagraphWords };
