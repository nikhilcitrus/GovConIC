'use strict';

/**
 * NOTE on scope: the actual HTTP transport in production is n8n's native HTTP Request
 * node, configured with an n8n credential for Authorization (never a hardcoded header
 * value) and this skill's timeout/retry settings. This module provides the transport-
 * agnostic decision logic (what counts as a transient failure, how to shape the call
 * config, how to parse the response envelope, how to redact for logging) so it can be
 * unit-tested without a real network call. `callWithRetry` accepts an injectable
 * transport function so tests can simulate success/timeout/rate-limit/malformed-JSON
 * without any actual HTTP traffic.
 */

const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function isTransientError(err) {
  if (!err) return false;
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') return true;
  if (typeof err.statusCode === 'number' && TRANSIENT_STATUS_CODES.has(err.statusCode)) return true;
  if (typeof err.status === 'number' && TRANSIENT_STATUS_CODES.has(err.status)) return true;
  return false;
}

/**
 * @param {object} providerConfig - { provider, baseUrl, model, timeoutMs, retryCount, retryDelayMs }
 * @param {string} credentialRef - a non-secret credential reference (e.g. n8n credential name/id),
 *   never the credential value itself
 * @returns {object} a non-secret HTTP call configuration
 */
function buildHttpCallConfig(providerConfig, credentialRef) {
  if (!providerConfig || !providerConfig.baseUrl) {
    throw new Error('llm-content-generator: providerConfig.baseUrl is required');
  }
  if (!credentialRef) {
    throw new Error('llm-content-generator: credentialRef is required (never embed the credential value here)');
  }
  return {
    method: 'POST',
    url: providerConfig.baseUrl,
    headers: { 'Content-Type': 'application/json' },
    rawContentType: 'application/json',
    timeoutMs: providerConfig.timeoutMs || 30000,
    credentialRef,
    retry: {
      count: providerConfig.retryCount || 3,
      delayMs: providerConfig.retryDelayMs || 5000
    }
  };
}

/**
 * Parses the OpenAI-compatible envelope. Does NOT parse the embedded article JSON
 * string — that is article-response-normalizer's responsibility.
 */
function parseProviderResponse(raw) {
  if (!raw || !Array.isArray(raw.choices) || raw.choices.length === 0) {
    throw new Error('llm-content-generator: malformed provider response envelope (missing choices[])');
  }
  const message = raw.choices[0].message;
  if (!message || typeof message.content !== 'string') {
    throw new Error('llm-content-generator: malformed provider response envelope (missing choices[0].message.content)');
  }
  return {
    content: message.content,
    usage: raw.usage || null,
    model: raw.model || null
  };
}

function redactForLogging(value) {
  const clone = JSON.parse(JSON.stringify(value || {}));
  if (clone.headers && clone.headers.Authorization) clone.headers.Authorization = '[REDACTED]';
  if (clone.headers && clone.headers.authorization) clone.headers.authorization = '[REDACTED]';
  if (clone.credentialRef) clone.credentialRef = '[REDACTED]';
  if (Array.isArray(clone.messages)) {
    clone.messages = clone.messages.map((m) => ({ role: m.role, content: '[REDACTED — enable debug logging to view]' }));
  }
  return clone;
}

/**
 * @param {function(object): Promise<object>} transport - async (request) => rawProviderResponse
 * @param {object} request - the provider-neutral request from cmmc-editorial-prompt-builder
 * @param {object} [options] - { retryCount=3, retryDelayMs=5000, delayFn }
 * @returns {Promise<{content: string, usage: object|null, model: string|null, attempts: number}>}
 */
async function callWithRetry(transport, request, options = {}) {
  const retryCount = typeof options.retryCount === 'number' ? options.retryCount : 3;
  const retryDelayMs = typeof options.retryDelayMs === 'number' ? options.retryDelayMs : 5000;
  const delayFn = options.delayFn || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  let lastError;
  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      const raw = await transport(request);
      const parsed = parseProviderResponse(raw);
      return Object.assign({ attempts: attempt }, parsed);
    } catch (err) {
      lastError = err;
      const transient = isTransientError(err);
      const hasAttemptsLeft = attempt < retryCount;
      if (!transient || !hasAttemptsLeft) {
        throw err;
      }
      await delayFn(retryDelayMs);
    }
  }
  throw lastError;
}

module.exports = { isTransientError, buildHttpCallConfig, parseProviderResponse, redactForLogging, callWithRetry };
