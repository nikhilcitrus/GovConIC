'use strict';

const fs = require('fs');
const path = require('path');

const SYSTEM_TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'system-prompt.md');
const USER_TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'user-prompt.md');

function render(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in vars)) {
      throw new Error(`cmmc-editorial-prompt-builder: missing template variable "${key}"`);
    }
    return vars[key];
  });
}

function buildPerspectiveBlock(generationRequest) {
  const { perspective, perspectiveInstructions, sourceReference } = generationRequest;
  if (!perspective) return '';
  const source = sourceReference || {};
  return (
    `\nYou are analyzing a source article as a senior federal technology journalist, CISO, CTO, CMMC assessor, ` +
    `software architect, and compliance expert. Do NOT summarize the source article — analyze it deeply and ` +
    `identify what is missing, what assumptions it makes, what lessons are hidden beneath it, and what this ` +
    `specific audience should do differently.\n` +
    `Source article title: ${source.title || ''}\n` +
    `Source article URL: ${source.url || ''}\n` +
    `This piece's perspective (${perspective}): ${perspectiveInstructions || ''}\n`
  );
}

/**
 * @param {object} params
 * @param {object} params.generationRequest - GenerationRequest (see data-model.md)
 * @param {object} params.editorialConfig - { brand, audience, voiceDescription }
 * @param {object} params.validationConfig - canonical word/block-count rule (see validation-config.json)
 * @param {object} params.providerConfig - { model, temperature, maxTokens }
 * @returns {object} provider-neutral LLM request matching contracts/llm-request.schema.json
 */
function buildGenerationRequest(params) {
  const { generationRequest, editorialConfig, validationConfig, providerConfig } = params;

  if (!generationRequest || !generationRequest.topic) {
    throw new Error('cmmc-editorial-prompt-builder: generationRequest.topic is required');
  }
  if (!editorialConfig || !editorialConfig.brand) {
    throw new Error('cmmc-editorial-prompt-builder: editorialConfig.brand is required');
  }
  if (!validationConfig) {
    throw new Error('cmmc-editorial-prompt-builder: validationConfig is required');
  }
  if (!providerConfig || !providerConfig.model) {
    throw new Error('cmmc-editorial-prompt-builder: providerConfig.model is required');
  }

  const systemTemplate = fs.readFileSync(SYSTEM_TEMPLATE_PATH, 'utf8');
  const userTemplate = fs.readFileSync(USER_TEMPLATE_PATH, 'utf8');

  const systemPrompt = render(systemTemplate, {
    brand: editorialConfig.brand,
    audience: editorialConfig.audience || 'mid-market government contractors',
    voiceDescription:
      editorialConfig.voiceDescription ||
      'authoritative, analytical, opinionated, evidence-conscious, practical, non-promotional',
    paragraphCount: String(validationConfig.paragraphCount),
    h2Count: String(validationConfig.h2Count),
    statCount: String(validationConfig.statCount),
    pullquoteCount: String(validationConfig.pullquoteCount),
    calloutCount: String(validationConfig.calloutCount),
    paragraphWordMin: String(validationConfig.paragraphWordMin),
    paragraphWordMax: String(validationConfig.paragraphWordMax),
    totalWordMin: String(validationConfig.totalWordMin),
    totalWordMax: String(validationConfig.totalWordMax)
  });

  const userPrompt = render(userTemplate, {
    topic: generationRequest.topic,
    format: generationRequest.format || '',
    leadAngle: generationRequest.leadAngle || '',
    avoidTopics: (generationRequest.avoidTopics || []).join('; ') || 'none',
    recentHeadlines: (generationRequest.recentHeadlines || []).join(' | ') || 'none',
    perspectiveBlock: buildPerspectiveBlock(generationRequest)
  });

  const request = {
    model: providerConfig.model,
    response_format: { type: 'json_object' },
    max_tokens: providerConfig.maxTokens || 2000,
    temperature: typeof providerConfig.temperature === 'number' ? providerConfig.temperature : 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };

  return request;
}

module.exports = { buildGenerationRequest, render, buildPerspectiveBlock };
