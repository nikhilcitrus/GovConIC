'use strict';

const SUPPORTED_TYPES = new Set(['p', 'h2', 'h3', 'h4', 'stat', 'pullquote', 'list', 'callout']);

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBlock(block, options) {
  switch (block.type) {
    case 'p':
      return `<p>${escapeHtml(block.text)}</p>`;
    case 'h2':
      return `<h2>${escapeHtml(block.text)}</h2>`;
    case 'h3':
      return `<h3>${escapeHtml(block.text)}</h3>`;
    case 'h4':
      return `<h4>${escapeHtml(block.text)}</h4>`;
    case 'stat':
      return `<div class="stat"><span class="stat-value">${escapeHtml(block.value)}</span><span class="stat-label">${escapeHtml(block.label)}</span></div>`;
    case 'pullquote':
      return `<blockquote>${escapeHtml(block.text)}</blockquote>`;
    case 'list':
      return `<ul>${(block.items || []).map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
    case 'callout':
      return `<div class="callout">${escapeHtml(block.text)}</div>`;
    default:
      if (options.fallbackMode) {
        // Explicit, tested, non-guessing fallback: render the raw block as a clearly
        // labeled, escaped diagnostic element. This never attempts to infer which
        // property is "the heading" vs "the body" — that heuristic (research.md R12)
        // is exactly what this fallback replaces.
        return `<div class="unrecognized-block" data-block-type="${escapeHtml(block.type)}">${escapeHtml(
          JSON.stringify(block)
        )}</div>`;
      }
      return null; // signals an unsupported block to the caller
  }
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(text) {
  const trimmed = (text || '').trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}

/**
 * @param {Array<object>} body - ordered array of ContentBlock (see data-model.md#contentblock)
 * @param {object} [options] - { fallbackMode=false }
 * @returns {{valid: boolean, errors: Array, html: string|null, plainText: string|null,
 *   paragraphWordCount: number, fullWordCount: number}}
 */
function convertBlocksToHtml(body, options = {}) {
  const fallbackMode = Boolean(options.fallbackMode);

  if (!Array.isArray(body)) {
    return {
      valid: false,
      errors: [{ code: 'invalid_body', message: 'body must be an array of content blocks' }],
      html: null,
      plainText: null,
      paragraphWordCount: 0,
      fullWordCount: 0
    };
  }

  const errors = [];
  const htmlParts = [];

  body.forEach((block, index) => {
    if (!block || typeof block.type !== 'string') {
      errors.push({ code: 'invalid_block', message: `Block at index ${index} has no valid "type"`, index });
      return;
    }
    if (!SUPPORTED_TYPES.has(block.type) && !fallbackMode) {
      errors.push({
        code: 'unsupported_block_type',
        message: `Block at index ${index} has unsupported type "${block.type}" and fallbackMode is disabled`,
        index,
        type: block.type
      });
      return;
    }
    const rendered = renderBlock(block, { fallbackMode });
    if (rendered === null) {
      errors.push({ code: 'unsupported_block_type', message: `Block at index ${index} has unsupported type "${block.type}"`, index, type: block.type });
      return;
    }
    htmlParts.push(rendered);
  });

  if (errors.length > 0) {
    return { valid: false, errors, html: null, plainText: null, paragraphWordCount: 0, fullWordCount: 0 };
  }

  const html = htmlParts.join('\n');
  const plainText = stripTags(html);
  const paragraphWordCount = body
    .filter((b) => b.type === 'p')
    .reduce((total, b) => total + wordCount(b.text), 0);
  const fullWordCount = wordCount(plainText);

  return { valid: true, errors: [], html, plainText, paragraphWordCount, fullWordCount };
}

module.exports = { convertBlocksToHtml, escapeHtml, stripTags, wordCount, SUPPORTED_TYPES };
