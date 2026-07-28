'use strict';

/**
 * @param {object} params
 * @param {object} params.article - normalized Article (from article-response-normalizer)
 * @param {string} params.html - rendered HTML body (from article-blocks-to-html)
 * @param {object} params.config - { baseUrl, categoryId, defaultStatus, author } — WordPress defaults, config-driven, never hardcoded
 * @returns {object} payload matching contracts/wordpress-request.schema.json
 */
function buildWordPressPayload(params) {
  const { article, html, config } = params;

  if (!article || !article.headline) {
    throw new Error('wordpress-draft-publisher: article.headline is required');
  }
  if (!html) {
    throw new Error('wordpress-draft-publisher: html content is required');
  }
  if (!config || config.categoryId === undefined || config.categoryId === null) {
    throw new Error('wordpress-draft-publisher: config.categoryId is required');
  }

  const subtitle = article.subtitle || article.dek || '';

  return {
    title: article.headline,
    content: html,
    slug: article.slug || '',
    status: 'draft', // always draft in this workflow — never any other status
    categories: [Number(config.categoryId)],
    featured_media: article.featuredMediaId || null,
    meta: {
      td_post_theme_settings: {
        td_subtitle: subtitle
      }
    }
  };
}

/**
 * @param {object} config - { baseUrl }
 * @param {string} credentialRef - non-secret n8n credential reference, never the credential value
 */
function buildHttpCallConfig(config, credentialRef) {
  if (!config || !config.baseUrl) {
    throw new Error('wordpress-draft-publisher: config.baseUrl is required');
  }
  if (!credentialRef) {
    throw new Error('wordpress-draft-publisher: credentialRef is required (never embed the credential value here)');
  }
  return {
    method: 'POST',
    url: `${config.baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`,
    headers: { 'Content-Type': 'application/json' },
    credentialRef
  };
}

function normalizeWordPressResponse(raw, extras = {}) {
  if (!raw || raw.id === undefined) {
    throw new Error('wordpress-draft-publisher: malformed WordPress response (missing id)');
  }
  return {
    postId: raw.id,
    status: raw.status || 'draft',
    categoryId: extras.categoryId,
    subtitleWritten: extras.subtitleWritten || '',
    publishedAt: raw.date_gmt ? `${raw.date_gmt}Z` : new Date().toISOString(),
    sourceUrl: extras.sourceUrl || null,
    groupId: extras.groupId || null
  };
}

/**
 * @param {object} params
 * @param {object} params.article
 * @param {string} params.html
 * @param {object} params.config - { baseUrl, categoryId }
 * @param {boolean} params.dryRun
 * @param {string} params.credentialRef
 * @param {function(object, object): Promise<object>} params.transport - async (callConfig, payload) => rawWordPressResponse
 * @param {string} [params.sourceUrl]
 * @param {string} [params.groupId]
 * @returns {Promise<object>} either { dryRun: true, wouldPublish: payload } or a PublicationRecord
 */
async function publishDraft(params) {
  const { article, html, config, dryRun, credentialRef, transport, sourceUrl, groupId } = params;

  const payload = buildWordPressPayload({ article, html, config });

  if (dryRun) {
    return { dryRun: true, wouldPublish: payload };
  }

  const callConfig = buildHttpCallConfig(config, credentialRef);
  const raw = await transport(callConfig, payload);

  return normalizeWordPressResponse(raw, {
    categoryId: Number(config.categoryId),
    subtitleWritten: payload.meta.td_post_theme_settings.td_subtitle,
    sourceUrl,
    groupId
  });
}

module.exports = { buildWordPressPayload, buildHttpCallConfig, normalizeWordPressResponse, publishDraft };
