'use strict';

const PERSPECTIVES = [
  {
    perspective: 'Executive',
    perspectiveInstructions:
      'Write for CEOs, CIOs, CTOs, CISOs, boards, and government contractors. Focus on strategic risk, ' +
      'business impact, and the decisions leadership needs to make.'
  },
  {
    perspective: 'Engineering',
    perspectiveInstructions:
      'Write for DevSecOps and engineering teams. Focus on evidence automation, secure software development, ' +
      'continuous compliance, AI-assisted engineering, and operational excellence.'
  },
  {
    perspective: 'Compliance',
    perspectiveInstructions:
      'Write for compliance and risk teams. Focus on CMMC, NIST SP 800-171, DIBCAC assessments, False Claims Act ' +
      'implications, evidence generation, and audit readiness.'
  }
];

/**
 * @param {object} params
 * @param {string} params.groupId - caller-supplied unique id shared by all 3 requests
 *   (e.g. derived from the n8n execution id — this module never generates timestamps itself,
 *   to keep it a pure, deterministically-testable function)
 * @param {string} params.topic
 * @param {string} params.leadAngle
 * @param {string[]} params.avoidTopics
 * @param {string[]} params.recentHeadlines
 * @param {object} params.sourceArticle - a SourceArticle with usable === true
 * @returns {object[]} exactly 3 GenerationRequest objects (Executive, Engineering, Compliance)
 */
function planMultiPerspectiveRequests(params) {
  const { groupId, topic, leadAngle, avoidTopics = [], recentHeadlines = [], sourceArticle } = params;

  if (!groupId) {
    throw new Error('multi-perspective-planner: groupId is required');
  }
  if (!sourceArticle || sourceArticle.usable !== true) {
    throw new Error('multi-perspective-planner: a usable sourceArticle is required for multi-perspective planning');
  }
  if (!topic) {
    throw new Error('multi-perspective-planner: topic is required');
  }

  const requests = PERSPECTIVES.map((p) => ({
    topic,
    format: `${p.perspective} perspective: ${p.perspectiveInstructions}`,
    leadAngle,
    avoidTopics,
    recentHeadlines,
    perspective: p.perspective,
    perspectiveInstructions: p.perspectiveInstructions,
    groupId,
    sourceReference: sourceArticle
  }));

  if (requests.length !== 3) {
    // Defensive invariant check — should be structurally impossible given PERSPECTIVES above.
    throw new Error(`multi-perspective-planner: expected exactly 3 requests, produced ${requests.length}`);
  }

  return requests;
}

module.exports = { planMultiPerspectiveRequests, PERSPECTIVES };
