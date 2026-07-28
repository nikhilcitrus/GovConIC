'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateWorkflowJson } = require('../scripts/validate-workflow');

function baseWorkflow(overrides = {}) {
  return Object.assign(
    {
      active: false,
      nodes: [
        { id: '1', name: 'Schedule Trigger', type: 'n8n-nodes-base.scheduleTrigger', parameters: {} },
        { id: '2', name: 'Select Topic And Angle', type: 'n8n-nodes-base.code', parameters: { jsCode: 'return items;' } },
        { id: '3', name: 'Call Groq For Article', type: 'n8n-nodes-base.httpRequest', parameters: {} },
        { id: '4', name: 'Normalize Article Response', type: 'n8n-nodes-base.code', parameters: { jsCode: 'return items;' } }
      ],
      connections: {
        'Schedule Trigger': { main: [[{ node: 'Select Topic And Angle', type: 'main', index: 0 }]] },
        'Select Topic And Angle': { main: [[{ node: 'Call Groq For Article', type: 'main', index: 0 }]] },
        'Call Groq For Article': { main: [[{ node: 'Normalize Article Response', type: 'main', index: 0 }]] }
      }
    },
    overrides
  );
}

test('a well-formed, inactive workflow with no fragile lookups passes validation', () => {
  const result = validateWorkflowJson(baseWorkflow());
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('rejects a workflow where active is true', () => {
  const result = validateWorkflowJson(baseWorkflow({ active: true }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('active must be false')));
});

test('rejects an embedded Groq-shaped API key anywhere in the workflow', () => {
  const wf = baseWorkflow();
  wf.nodes[2].parameters = { headerParameters: { parameters: [{ name: 'Authorization', value: 'Bearer gsk_SYNTHETICTESTKEYNOTAREALCREDENTIAL0000' }] } };
  const result = validateWorkflowJson(wf);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('credential-shaped string')));
});

test('rejects a fragile node-name lookup in a Code node', () => {
  const wf = baseWorkflow();
  wf.nodes[3].parameters.jsCode = "const upstream = $('Select Topic And Angle').item.json; return items;";
  const result = validateWorkflowJson(wf);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('fragile node-name lookup')));
});

test('rejects an orphaned node with no connections at all (resolves research.md R13)', () => {
  const wf = baseWorkflow();
  wf.nodes.push({ id: '5', name: 'HTML', type: 'n8n-nodes-base.html', parameters: {} });
  const result = validateWorkflowJson(wf);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('"HTML" is orphaned')));
});

test('rejects a splitInBatches node whose loop body never connects back to it (resolves research.md R14)', () => {
  const wf = baseWorkflow();
  wf.nodes.push({ id: '6', name: 'Batch Perspectives', type: 'n8n-nodes-base.splitInBatches', parameters: {} });
  wf.nodes.push({ id: '7', name: 'Build Perspective Prompt', type: 'n8n-nodes-base.code', parameters: { jsCode: 'return items;' } });
  wf.connections['Batch Perspectives'] = { main: [[], [{ node: 'Build Perspective Prompt', type: 'main', index: 0 }]] };
  // 'Build Perspective Prompt' has no outgoing connection at all — never loops back
  wf.connections['Build Perspective Prompt'] = { main: [[]] };
  const result = validateWorkflowJson(wf);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('never leads back to itself')));
});

test('accepts a splitInBatches node whose loop body does connect back to it', () => {
  const wf = baseWorkflow();
  wf.nodes.push({ id: '6', name: 'Batch Perspectives', type: 'n8n-nodes-base.splitInBatches', parameters: {} });
  wf.nodes.push({ id: '7', name: 'Build Perspective Prompt', type: 'n8n-nodes-base.code', parameters: { jsCode: 'return items;' } });
  wf.connections['Batch Perspectives'] = { main: [[], [{ node: 'Build Perspective Prompt', type: 'main', index: 0 }]] };
  wf.connections['Build Perspective Prompt'] = { main: [[{ node: 'Batch Perspectives', type: 'main', index: 0 }]] };
  const result = validateWorkflowJson(wf);
  assert.equal(result.valid, true);
});

test('warns (but does not fail) on a generic default node name', () => {
  const wf = baseWorkflow();
  wf.nodes[2].name = 'HTTP Request';
  wf.connections['Select Topic And Angle'] = { main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]] };
  wf.connections['HTTP Request'] = { main: [[{ node: 'Normalize Article Response', type: 'main', index: 0 }]] };
  const result = validateWorkflowJson(wf);
  assert.ok(result.warnings.some((w) => w.includes('generic default name')));
});
