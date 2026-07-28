'use strict';

const REQUIRED_STATUSES = [
  'selected',
  'generated',
  'normalization_failed',
  'oat_failed',
  'publication_failed',
  'published',
  'memory_updated',
  'skipped_duplicate',
  'dry_run_complete'
];

const SECRET_PATTERNS = [
  /gsk_[A-Za-z0-9]+/g,
  /Bearer\s+\S+/gi,
  /"?password"?\s*[:=]\s*"?[^",\s]+/gi,
  /"?authorization"?\s*[:=]\s*"?[^",\s]+/gi,
  /"?api[_-]?key"?\s*[:=]\s*"?[^",\s]+/gi
];

function scrubSecrets(text) {
  let scrubbed = String(text || '');
  SECRET_PATTERNS.forEach((pattern) => {
    scrubbed = scrubbed.replace(pattern, '[REDACTED]');
  });
  return scrubbed;
}

/**
 * @param {object} params
 * @param {string} params.runId
 * @param {string} [params.articleId]
 * @param {string} [params.groupId]
 * @param {string} params.stage
 * @param {string} params.status - one of REQUIRED_STATUSES
 * @param {number} [params.durationMs]
 * @param {number} [params.retryCount]
 * @param {string} [params.failureCode]
 * @param {string} [params.message] - scrubbed for secret-shaped substrings before being stored
 * @param {boolean} [params.includeSensitiveContent=false] - must be explicitly true to retain raw message;
 *   even then, secret-shaped substrings are still scrubbed unconditionally.
 * @returns {object} a structured log event
 */
function createLogEvent(params) {
  const {
    runId,
    articleId,
    groupId,
    stage,
    status,
    durationMs,
    retryCount,
    failureCode,
    message,
    includeSensitiveContent
  } = params;

  if (!runId) throw new Error('workflow-observability-reporter: runId is required');
  if (!stage) throw new Error('workflow-observability-reporter: stage is required');
  if (!REQUIRED_STATUSES.includes(status)) {
    throw new Error(`workflow-observability-reporter: unknown status "${status}" (must be one of ${REQUIRED_STATUSES.join(', ')})`);
  }

  const safeMessage = includeSensitiveContent
    ? scrubSecrets(message)
    : scrubSecrets((message || '').slice(0, 300));

  return {
    runId,
    articleId: articleId || null,
    groupId: groupId || null,
    stage,
    status,
    durationMs: typeof durationMs === 'number' ? durationMs : null,
    retryCount: typeof retryCount === 'number' ? retryCount : 0,
    failureCode: failureCode || null,
    message: safeMessage,
    timestamp: new Date().toISOString()
  };
}

module.exports = { createLogEvent, scrubSecrets, REQUIRED_STATUSES };
