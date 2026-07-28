'use strict';

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

function normalizeContent(content) {
  return String(content || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function appendDedupTrim(list, value, limit) {
  const arr = Array.isArray(list) ? list.slice() : [];
  if (value && !arr.includes(value)) arr.push(value);
  if (typeof limit === 'number' && limit > 0 && arr.length > limit) {
    return arr.slice(arr.length - limit);
  }
  return arr;
}

/**
 * Pure transform: prior WorkflowMemory + a confirmed PublicationRecord -> updated WorkflowMemory.
 * Callers MUST invoke this only after wordpress-draft-publisher has returned a confirmed,
 * non-dry-run PublicationRecord (resolves research.md R9). This function performs no I/O
 * itself — persistence is the caller's job, via whichever storage adapter is configured.
 *
 * @param {object} params
 * @param {object} params.memory - prior WorkflowMemory
 * @param {object} params.article - the published Article (for headline, followOnIdeas, body)
 * @param {object} params.publicationRecord - confirmed PublicationRecord from wordpress-draft-publisher
 * @param {object} params.cacheLimits - { recentHeadlines=15, pendingFollowOnTopics=30, duplicateHistory=300 }
 * @returns {object} updated WorkflowMemory
 */
function updateMemoryAfterPublish(params) {
  const { memory = {}, article, publicationRecord, cacheLimits = {} } = params;

  if (!article || !article.headline) {
    throw new Error('publication-memory-updater: article.headline is required');
  }
  if (!publicationRecord || publicationRecord.postId === undefined) {
    throw new Error('publication-memory-updater: a confirmed publicationRecord (with postId) is required');
  }

  const limits = Object.assign({ recentHeadlines: 15, pendingFollowOnTopics: 30, duplicateHistory: 300 }, cacheLimits);

  const bodyText = (article.body || []).filter((b) => b.text).map((b) => b.text).join(' ');
  const contentHash = simpleHash(normalizeContent(bodyText));

  const followOnTitles = (article.followOnIdeas || []).map((idea) => (typeof idea === 'string' ? idea : idea.title)).filter(Boolean);

  let updated = Object.assign({}, memory);
  updated.recentHeadlines = appendDedupTrim(memory.recentHeadlines, article.headline, limits.recentHeadlines);
  updated.postedTitles = appendDedupTrim(memory.postedTitles, article.headline, limits.duplicateHistory);
  updated.postedContentHashes = appendDedupTrim(memory.postedContentHashes, contentHash, limits.duplicateHistory);
  if (publicationRecord.sourceUrl) {
    updated.postedUrls = appendDedupTrim(memory.postedUrls, publicationRecord.sourceUrl, limits.duplicateHistory);
  } else {
    updated.postedUrls = Array.isArray(memory.postedUrls) ? memory.postedUrls.slice() : [];
  }

  let pendingFollowOnTopics = Array.isArray(memory.pendingFollowOnTopics) ? memory.pendingFollowOnTopics.slice() : [];
  followOnTitles.forEach((title) => {
    pendingFollowOnTopics = appendDedupTrim(pendingFollowOnTopics, title, limits.pendingFollowOnTopics);
  });
  updated.pendingFollowOnTopics = pendingFollowOnTopics;

  updated.oatPassedCount = (Number.isFinite(memory.oatPassedCount) ? memory.oatPassedCount : 0) + 1;
  updated.lastPublicationTimestamp = publicationRecord.publishedAt;

  return updated;
}

/**
 * Reference in-memory storage adapter — useful for tests and as documentation of the
 * adapter interface. Production uses an n8n-static-data adapter (see SKILL.md); a future
 * database-backed adapter implements the same { read, write } shape.
 */
function createInMemoryAdapter(initial = {}) {
  let state = Object.assign({}, initial);
  return {
    read: () => state,
    write: (memory) => {
      state = memory;
      return state;
    }
  };
}

module.exports = { updateMemoryAfterPublish, createInMemoryAdapter, appendDedupTrim, simpleHash, normalizeContent };
