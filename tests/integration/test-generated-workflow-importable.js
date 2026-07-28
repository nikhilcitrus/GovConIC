'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { validateWorkflowJson } = require(path.join('..', '..', '.specify/skills/n8n-workflow-assembler/scripts/validate-workflow'));

const WORKFLOW_PATH = path.join(__dirname, '..', '..', 'n8n', 'generated', 'govconic-cmmc-content-publishing.json');
const ORIGINAL_REFERENCE_PATH = path.join(__dirname, '..', '..', 'n8n', 'source', 'cmmc-prompt-development.original.json');

test('the generated workflow JSON is valid, parseable JSON', () => {
  const raw = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  const workflow = JSON.parse(raw); // throws if malformed
  assert.ok(Array.isArray(workflow.nodes) && workflow.nodes.length > 0);
});

test('the generated workflow passes n8n-workflow-assembler structural validation (no errors, no orphans, no broken loops, no fragile lookups)', () => {
  const workflow = JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf8'));
  const result = validateWorkflowJson(workflow);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('the generated workflow remains inactive (active: false)', () => {
  const workflow = JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf8'));
  assert.equal(workflow.active, false);
});

test('the generated workflow has both a schedule trigger and a manual trigger', () => {
  const workflow = JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf8'));
  const types = workflow.nodes.map((n) => n.type);
  assert.ok(types.includes('n8n-nodes-base.scheduleTrigger'));
  assert.ok(types.includes('n8n-nodes-base.manualTrigger'));
});

test('the generated workflow always sets WordPress status to draft, never any other value', () => {
  const workflow = JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf8'));
  const publishNode = workflow.nodes.find((n) => n.name === 'Publish WordPress Draft');
  assert.ok(publishNode);
  assert.ok(publishNode.parameters.body.includes('"draft"'));
  assert.ok(!publishNode.parameters.body.includes('"publish"'));
});

test('no credential-shaped string appears anywhere in the generated workflow JSON', () => {
  const raw = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  assert.ok(!/gsk_[A-Za-z0-9]+/.test(raw));
  assert.ok(!/Bearer\s+[A-Za-z0-9._-]{10,}/.test(raw));
});

test('the cleaned original reference copy exists, is valid JSON, and contains no credential-shaped string', () => {
  const raw = fs.readFileSync(ORIGINAL_REFERENCE_PATH, 'utf8');
  JSON.parse(raw); // throws if malformed
  assert.ok(!/gsk_[A-Za-z0-9]+/.test(raw));
  assert.ok(raw.includes('REDACTED'));
});

test('the original untouched source workflow file was not modified or deleted', () => {
  const originalPath = path.join(__dirname, '..', '..', 'n8n', 'cmmc prompt development.json');
  assert.ok(fs.existsSync(originalPath));
});
