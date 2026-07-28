'use strict';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function deterministicIndex(seed, length) {
  let hash = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return length > 0 ? hash % length : 0;
}

/**
 * @param {object} params
 * @param {object} params.context - WorkflowContext from workflow-context-manager
 *   (selectedFormat, selectedLeadAngle, avoidedTopics, recentHeadlines, normalizedSourceArticle)
 * @param {object} params.config - { topics: string[], multiPerspectiveFormatMarker: string }
 * @param {string} [params.seed] - deterministic topic pick when supplied
 * @returns {object} { rejected, reason?, generationMode, topic?, leadAngle?, format? }
 */
function selectTopicAndMode(params) {
  const { context, config, seed } = params;

  if (!context || !context.selectedFormat) {
    throw new Error('topic-angle-selector: context.selectedFormat is required (run workflow-context-manager first)');
  }
  if (!config || !Array.isArray(config.topics) || config.topics.length === 0) {
    throw new Error('topic-angle-selector: config.topics is required and must be non-empty');
  }
  if (!config.multiPerspectiveFormatMarker) {
    throw new Error('topic-angle-selector: config.multiPerspectiveFormatMarker is required');
  }

  const isMultiPerspective = context.selectedFormat === config.multiPerspectiveFormatMarker;

  if (isMultiPerspective) {
    const source = context.normalizedSourceArticle;
    if (!source || !source.usable) {
      return {
        rejected: true,
        reason: 'source-unusable',
        generationMode: 'multiPerspective'
      };
    }
  }

  const excluded = new Set((context.avoidedTopics || []).map(normalize));
  let eligible = config.topics.filter((t) => !excluded.has(normalize(t)));
  if (eligible.length === 0) {
    // Every configured topic has been avoided recently; fall back to the full list
    // rather than failing the run — this is a documented degradation, not a silent one.
    eligible = config.topics;
  }

  const index = seed ? deterministicIndex(seed, eligible.length) : 0;
  const topic = eligible[index];

  return {
    rejected: false,
    generationMode: isMultiPerspective ? 'multiPerspective' : 'standard',
    topic,
    leadAngle: context.selectedLeadAngle,
    format: context.selectedFormat
  };
}

module.exports = { selectTopicAndMode, normalize, deterministicIndex };
