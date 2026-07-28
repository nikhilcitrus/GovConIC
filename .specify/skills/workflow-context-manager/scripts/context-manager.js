'use strict';

/**
 * workflow-context-manager reference implementation.
 * Pure functions only — no n8n API calls, no file/database I/O.
 * The calling n8n Code node is responsible for reading memory in and
 * writing `updatedMemory` back out via $getWorkflowStaticData('global')
 * (or another configured storage adapter).
 */

function trimToLimit(list, limit) {
  if (!Array.isArray(list)) return [];
  if (typeof limit !== 'number' || limit <= 0) return list.slice();
  return list.length > limit ? list.slice(list.length - limit) : list.slice();
}

function deterministicIndex(seed, length) {
  let hash = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return length > 0 ? hash % length : 0;
}

function normalizeSourceArticleShape(incoming) {
  if (!incoming || typeof incoming !== 'object') {
    return { title: '', url: '', content: '', usable: false };
  }
  const title = incoming.title || incoming.articleTitle || '';
  const url = incoming.link || incoming.url || incoming.articleUrl || '';
  const content = incoming.content || incoming.articleContent || incoming.text || incoming.rawContent || '';
  const usable = Boolean(title.trim() && content.trim());
  return { title, url, content, usable };
}

/**
 * @param {object} params
 * @param {object} params.memory - prior WorkflowMemory (see data-model.md)
 * @param {object} params.config - { formats: string[], leadAngles: string[],
 *   avoidedBaselineTopics: string[], cacheLimits: { recentHeadlines, pendingFollowOnTopics, duplicateHistory } }
 * @param {string} params.runId
 * @param {string} [params.seed] - when present, selection is deterministic and memory is NOT advanced
 * @param {boolean} [params.dryRun]
 * @param {object} [params.incomingSourceArticle]
 * @returns {object} WorkflowContext + updatedMemory (caller persists updatedMemory)
 */
function loadWorkflowContext(params) {
  const { memory = {}, config, runId, seed, dryRun, incomingSourceArticle } = params;

  if (!config || !Array.isArray(config.formats) || config.formats.length === 0) {
    throw new Error('workflow-context-manager: config.formats is required and must be non-empty');
  }
  if (!Array.isArray(config.leadAngles) || config.leadAngles.length === 0) {
    throw new Error('workflow-context-manager: config.leadAngles is required and must be non-empty');
  }
  if (!runId) {
    throw new Error('workflow-context-manager: runId is required');
  }

  const cacheLimits = Object.assign(
    { recentHeadlines: 15, pendingFollowOnTopics: 30, duplicateHistory: 300 },
    config.cacheLimits || {}
  );

  const formatRotationIndex = Number.isInteger(memory.formatRotationIndex) ? memory.formatRotationIndex : 0;
  const leadAngleRotationIndex = Number.isInteger(memory.leadAngleRotationIndex) ? memory.leadAngleRotationIndex : 0;

  let chosenFormatIndex;
  let chosenAngleIndex;
  let updatedMemory = Object.assign({}, memory);

  if (seed) {
    // Deterministic mode: derive indices from the seed, do not mutate rotation state.
    chosenFormatIndex = deterministicIndex(`${seed}:format`, config.formats.length);
    chosenAngleIndex = deterministicIndex(`${seed}:angle`, config.leadAngles.length);
  } else {
    chosenFormatIndex = formatRotationIndex % config.formats.length;
    chosenAngleIndex = leadAngleRotationIndex % config.leadAngles.length;
    updatedMemory.formatRotationIndex = (formatRotationIndex + 1) % config.formats.length;
    updatedMemory.leadAngleRotationIndex = (leadAngleRotationIndex + 1) % config.leadAngles.length;
  }

  const recentHeadlines = trimToLimit(memory.recentHeadlines, cacheLimits.recentHeadlines);
  const pendingFollowOnTopics = trimToLimit(memory.pendingFollowOnTopics, cacheLimits.pendingFollowOnTopics);
  const avoidedTopics = (config.avoidedBaselineTopics || []).concat(pendingFollowOnTopics);

  return {
    context: {
      runId,
      dryRun: Boolean(dryRun),
      seed: seed || null,
      selectedFormat: config.formats[chosenFormatIndex],
      selectedLeadAngle: config.leadAngles[chosenAngleIndex],
      recentHeadlines,
      avoidedTopics,
      normalizedSourceArticle: incomingSourceArticle ? normalizeSourceArticleShape(incomingSourceArticle) : null,
      generationMode: null // set by topic-angle-selector once format is evaluated against the multi-perspective marker
    },
    updatedMemory
  };
}

module.exports = { loadWorkflowContext, trimToLimit, deterministicIndex, normalizeSourceArticleShape };
