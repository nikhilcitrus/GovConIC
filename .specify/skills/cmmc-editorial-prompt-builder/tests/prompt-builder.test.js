'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGenerationRequest } = require('../scripts/prompt-builder');

const editorialConfig = {
  brand: 'GovConIC — The Government Contractor Intelligence Center',
  audience: 'mid-market government contractors with $20M-$500M in revenue',
  voiceDescription: 'authoritative, analytical, opinionated, evidence-conscious, practical, non-promotional'
};

const validationConfig = {
  paragraphCount: 4,
  h2Count: 2,
  statCount: 1,
  pullquoteCount: 1,
  calloutCount: 1,
  paragraphWordMin: 20,
  paragraphWordMax: 50,
  totalWordMin: 100,
  totalWordMax: 200
};

const providerConfig = { model: 'llama-3.3-70b-versatile', temperature: 0.7, maxTokens: 2000 };

const generationRequest = {
  topic: 'SPRS score submission accuracy',
  format: 'a contrarian piece challenging a common assumption',
  leadAngle: 'Unobvious',
  avoidTopics: ['What is CMMC 2.0'],
  recentHeadlines: ['Old Headline']
};

test('builds a request matching the provider-neutral llm-request contract shape', () => {
  const request = buildGenerationRequest({ generationRequest, editorialConfig, validationConfig, providerConfig });
  assert.equal(request.model, 'llama-3.3-70b-versatile');
  assert.equal(request.response_format.type, 'json_object');
  assert.equal(request.messages.length, 2);
  assert.equal(request.messages[0].role, 'system');
  assert.equal(request.messages[1].role, 'user');
});

test('system prompt states the single canonical paragraph/h2 rule with no contradiction', () => {
  const request = buildGenerationRequest({ generationRequest, editorialConfig, validationConfig, providerConfig });
  const system = request.messages[0].content;
  assert.ok(system.includes('EXACTLY 4 paragraph'));
  assert.ok(system.includes('EXACTLY 2 "h2" blocks') || system.includes('EXACTLY 2'));
  assert.ok(!system.includes('eight paragraphs'));
  assert.ok(!system.includes('2-3'));
});

test('system prompt requires subtitle as part of the strict schema', () => {
  const request = buildGenerationRequest({ generationRequest, editorialConfig, validationConfig, providerConfig });
  assert.ok(request.messages[0].content.includes('"subtitle"'));
});

test('system prompt uses GovConIC branding, never legacy Federal Architect branding', () => {
  const request = buildGenerationRequest({ generationRequest, editorialConfig, validationConfig, providerConfig });
  const combined = request.messages[0].content + request.messages[1].content;
  assert.ok(combined.includes('GovConIC'));
  assert.ok(!combined.toLowerCase().includes('federalarchitect'));
});

test('user prompt includes avoided topics and recent headlines for exclusion', () => {
  const request = buildGenerationRequest({ generationRequest, editorialConfig, validationConfig, providerConfig });
  const user = request.messages[1].content;
  assert.ok(user.includes('What is CMMC 2.0'));
  assert.ok(user.includes('Old Headline'));
});

test('perspective-specific instructions appear only when perspective is set', () => {
  const standard = buildGenerationRequest({ generationRequest, editorialConfig, validationConfig, providerConfig });
  assert.ok(!standard.messages[1].content.includes('This piece\'s perspective'));

  const withPerspective = buildGenerationRequest({
    generationRequest: {
      ...generationRequest,
      perspective: 'Executive',
      perspectiveInstructions: 'Focus on strategic risk.',
      sourceReference: { title: 'Src', url: 'https://x', content: 'c', usable: true }
    },
    editorialConfig,
    validationConfig,
    providerConfig
  });
  assert.ok(withPerspective.messages[1].content.includes("This piece's perspective (Executive)"));
  assert.ok(withPerspective.messages[1].content.includes('Focus on strategic risk.'));
});

test('request never carries a credential-shaped field', () => {
  const request = buildGenerationRequest({ generationRequest, editorialConfig, validationConfig, providerConfig });
  assert.equal(request.apiKey, undefined);
  assert.equal(request.api_key, undefined);
  assert.equal(request.authorization, undefined);
  assert.ok(!JSON.stringify(request).includes('gsk_'));
});

test('throws when required config is missing (fail fast)', () => {
  assert.throws(() => buildGenerationRequest({ generationRequest, editorialConfig: {}, validationConfig, providerConfig }));
  assert.throws(() => buildGenerationRequest({ generationRequest: {}, editorialConfig, validationConfig, providerConfig }));
  assert.throws(() => buildGenerationRequest({ generationRequest, editorialConfig, validationConfig, providerConfig: {} }));
});
