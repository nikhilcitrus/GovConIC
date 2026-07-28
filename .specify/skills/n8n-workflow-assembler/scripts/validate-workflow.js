'use strict';

const NODE_NAME_LOOKUP_RE = /\$\(\s*['"][^'"]+['"]\s*\)/g;
const SECRET_LIKE_RE = [/gsk_[A-Za-z0-9]+/g, /Bearer\s+[A-Za-z0-9._-]{10,}/g];
const GENERIC_DEFAULT_NAMES = new Set(['HTTP Request', 'Code', 'Loop Over Items', 'IF', 'Switch']);
const TRIGGER_TYPES = new Set(['n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.manualTrigger']);

function nodeById(workflow, id) {
  return workflow.nodes.find((n) => n.id === id || n.name === id);
}

function buildAdjacency(workflow) {
  const adjacency = {};
  Object.entries(workflow.connections || {}).forEach(([sourceName, outputs]) => {
    const targets = [];
    (outputs.main || []).forEach((branch) => {
      (branch || []).forEach((conn) => targets.push(conn.node));
    });
    adjacency[sourceName] = targets;
  });
  return adjacency;
}

function isReachable(adjacency, fromName, targetName) {
  const visited = new Set();
  const queue = [...(adjacency[fromName] || [])];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === targetName) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(adjacency[current] || []));
  }
  return false;
}

/**
 * @param {object} workflow - a parsed n8n workflow JSON document
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
function validateWorkflowJson(workflow) {
  const errors = [];
  const warnings = [];

  if (!workflow || !Array.isArray(workflow.nodes)) {
    return { valid: false, errors: ['workflow.nodes must be an array'], warnings: [] };
  }

  if (workflow.active !== false) {
    errors.push('workflow.active must be false — the generated workflow must never be auto-activated');
  }

  const serialized = JSON.stringify(workflow);
  SECRET_LIKE_RE.forEach((pattern) => {
    const matches = serialized.match(pattern);
    if (matches) {
      errors.push(`Found a credential-shaped string embedded in the workflow: ${matches[0].slice(0, 20)}...`);
    }
  });

  workflow.nodes.forEach((node) => {
    const jsCode = node.parameters && (node.parameters.jsCode || node.parameters.functionCode);
    if (typeof jsCode === 'string') {
      const lookups = jsCode.match(NODE_NAME_LOOKUP_RE);
      if (lookups) {
        errors.push(`Node "${node.name}" uses a fragile node-name lookup (${lookups[0]}) instead of an explicit input connection`);
      }
    }
    if (GENERIC_DEFAULT_NAMES.has(node.name)) {
      warnings.push(`Node "${node.name}" uses a generic default name — rename it to describe its responsibility`);
    }
  });

  const adjacency = buildAdjacency(workflow);
  const nodeNames = new Set(workflow.nodes.map((n) => n.name));
  const hasIncoming = new Set();
  Object.values(adjacency).forEach((targets) => targets.forEach((t) => hasIncoming.add(t)));

  workflow.nodes.forEach((node) => {
    const isTrigger = TRIGGER_TYPES.has(node.type);
    const hasOutgoing = (adjacency[node.name] || []).length > 0;
    const hasIncomingConn = hasIncoming.has(node.name);
    if (!isTrigger && !hasOutgoing && !hasIncomingConn) {
      errors.push(`Node "${node.name}" is orphaned — no incoming or outgoing connections`);
    }
  });

  workflow.nodes
    .filter((n) => n.type === 'n8n-nodes-base.splitInBatches')
    .forEach((node) => {
      const outputs = (workflow.connections[node.name] || {}).main || [];
      const loopTargets = outputs.flatMap((branch) => (branch || []).map((c) => c.node));
      const loopsBack = loopTargets.some((target) => target === node.name || isReachable(adjacency, target, node.name));
      if (loopTargets.length > 0 && !loopsBack) {
        errors.push(`splitInBatches node "${node.name}" has a loop-body connection that never leads back to itself — it will only process its first batch`);
      }
    });

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = { validateWorkflowJson, buildAdjacency, isReachable };
