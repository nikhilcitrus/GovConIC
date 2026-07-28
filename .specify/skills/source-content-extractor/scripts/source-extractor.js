'use strict';

/**
 * NOTE on scope: CSS-selector-based extraction itself (h1, .td-post-content, etc.) is
 * performed by n8n's native HTML node (n8n-nodes-base.html), configured with the
 * selectors from source-content-extractor's configuration (see SKILL.md). This module
 * covers everything downstream of that extraction: sanitization, normalization, and the
 * usability decision — it does not reimplement a CSS/HTML query engine.
 */

const SCRIPT_STYLE_RE = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi;
const TAG_RE = /<[^>]+>/g;
const WHITESPACE_RE = /\s+/g;

function sanitizeToPlainText(html) {
  if (!html) return '';
  return String(html)
    .replace(SCRIPT_STYLE_RE, ' ')
    .replace(TAG_RE, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(WHITESPACE_RE, ' ')
    .trim();
}

/**
 * @param {object} params
 * @param {object} params.extracted - raw output of the upstream CSS-selector extraction
 *   node, e.g. { title: '<h1>...</h1>' | 'Plain Title', content: '<div>...</div>' }
 * @param {string} [params.url] - the source article's URL, preserved for attribution
 * @param {object} [params.selectors] - the selector configuration actually used upstream,
 *   carried through for observability/debugging only (this module does not query with it)
 * @param {number} [params.minContentLength=40] - below this, content is treated as unusable
 * @returns {{title: string, url: string, content: string, usable: boolean}}
 */
function extractSourceArticle(params) {
  const { extracted = {}, url = '', selectors, minContentLength = 40 } = params;

  const title = sanitizeToPlainText(extracted.title);
  const content = sanitizeToPlainText(extracted.content);
  const usable = title.length > 0 && content.length >= minContentLength;

  return {
    title,
    url: url || '',
    content,
    usable,
    _selectorsUsed: selectors || null
  };
}

module.exports = { extractSourceArticle, sanitizeToPlainText };
