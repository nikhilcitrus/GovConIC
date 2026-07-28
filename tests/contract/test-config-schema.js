'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', '..', '.specify', 'workflows', 'cmmc-content-publishing', 'config');

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, name), 'utf8'));
}

test('editorial-config.json parses and has all required keys (FR-044, FR-045)', () => {
  const config = loadJson('editorial-config.json');
  ['brand', 'audience', 'formats', 'multiPerspectiveFormatMarker', 'leadAngles', 'topics', 'avoidedBaselineTopics', 'cacheLimits'].forEach((key) => {
    assert.ok(key in config, `editorial-config.json missing required key "${key}"`);
  });
  assert.ok(Array.isArray(config.formats) && config.formats.length > 0);
  assert.ok(config.formats.includes(config.multiPerspectiveFormatMarker));
  assert.equal(config.brand, 'GovConIC — The Government Contractor Intelligence Center');
  assert.ok(!JSON.stringify(config).toLowerCase().includes('federalarchitect'));
});

test('validation-config.json parses and has all required keys, matching the canonical word/block-count rule', () => {
  const config = loadJson('validation-config.json');
  [
    'paragraphCount', 'h2Count', 'statCount', 'pullquoteCount', 'calloutCount',
    'paragraphWordMin', 'paragraphWordMax', 'totalWordMin', 'totalWordMax', 'wordCountTolerance',
    'subtitleWordMin', 'subtitleWordMax', 'cmmcTerms', 'prohibitedPatterns', 'companionAssets'
  ].forEach((key) => {
    assert.ok(key in config, `validation-config.json missing required key "${key}"`);
  });
  assert.equal(config.paragraphCount, 4);
  assert.equal(config.h2Count, 2);
  assert.equal(config.totalWordMin, 100);
  assert.equal(config.totalWordMax, 200);
  assert.equal(config.wordCountTolerance, 0, 'no hidden tolerance — must be an explicit, documented 0 by default');
  assert.ok(config.cmmcTerms.length > 0);
});

test('provider-config.json parses and never contains a real credential value', () => {
  const config = loadJson('provider-config.json');
  assert.ok(config.llm && config.wordpress);
  const serialized = JSON.stringify(config);
  assert.ok(!/gsk_[A-Za-z0-9]+/.test(serialized));
  assert.ok(!/Bearer\s+[A-Za-z0-9._-]{10,}/.test(serialized));
  assert.equal(config.llm.credentialName, 'groqApiCredential');
  assert.equal(config.wordpress.credentialName, 'wordpressBasicAuthCredential');
});

test('all three config files fail loudly (not silently) if a required file is missing', () => {
  assert.throws(() => loadJson('nonexistent-config.json'));
});
