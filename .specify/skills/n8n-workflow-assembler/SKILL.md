---
name: n8n-workflow-assembler
description: Use to map the 12 other reusable skills onto n8n node types, wire their connections, and statically validate the assembled workflow JSON before it is considered import-ready. Do not use this skill to implement editorial/business logic itself — it only arranges already-implemented skills into a runnable graph and checks that graph for the structural defects found in the source workflow.
version: 1.0.0
inputs:
  - name: workflow
    type: object
    description: A parsed n8n workflow JSON document (nodes + connections) to validate.
outputs:
  - name: validationResult
    type: object
    description: "{ valid, errors, warnings } from the static structural checks."
dependencies:
  - all 12 other skills (this skill maps them onto nodes; it does not implement their logic)
---

## Purpose

Be the place where "which skill runs in which n8n node, and how do they connect" is decided and then mechanically checked — so the specific structural defects found in the source workflow (orphaned nodes, broken batch loops, fragile node-name lookups, embedded credentials, an always-active flag) cannot silently reappear in the reassembled version.

## When to use

- Once, to assemble `n8n/generated/govconic-cmmc-content-publishing.json` from the skill set.
- On every change to that workflow file, as a pre-import static check.

## When not to use

- Do not use this skill to write editorial rules, validation thresholds, or provider logic — those live in the other 12 skills; this skill only wires them together and checks the wiring.

## Required inputs

A parsed n8n workflow JSON object (`{ nodes: [...], connections: {...}, active: false, ... }`).

## Output contract

`{ valid, errors, warnings }`. `errors` are hard failures (must be fixed before import); `warnings` are advisory (e.g., a generic node name that still works but should be renamed for clarity).

## Skill-to-node mapping

| Skill | n8n node(s) | Notes |
|---|---|---|
| `workflow-context-manager` | Code node "Load Workflow Context" | Reads `$getWorkflowStaticData('global')`, calls `context-manager.js` |
| `topic-angle-selector` | Code node "Select Topic And Mode" | Consumes context-manager's output directly via node input, never `$('...')` |
| `source-content-extractor` | native `HTML` node "Extract Source Article" + Code node "Sanitize Source Article" | The HTML node performs CSS extraction; the Code node runs `source-extractor.js` |
| `multi-perspective-planner` | Code node "Plan Multi-Perspective Requests" | Only reached when `topic-angle-selector` output is `generationMode: multiPerspective` |
| `cmmc-editorial-prompt-builder` | Code node "Build Editorial Prompt" | Runs once per generation request |
| `llm-content-generator` | HTTP Request node "Call LLM Provider" (credential-based auth) | Retry/timeout configured from `provider-config.json` |
| `article-response-normalizer` | Code node "Normalize Article Response" | |
| `article-blocks-to-html` | Code node "Convert Blocks To HTML" | |
| `cmmc-oat-validator` | Code node "Run OAT Validation" | |
| *(pass/fail gate)* | IF node "Route OAT Pass/Fail" | Routes only `passed: true` results to publication; failing/diagnostic items go only to the reporter — resolves research.md R8 |
| `wordpress-draft-publisher` | HTTP Request node "Publish WordPress Draft" (credential-based auth) | Only reachable from the IF node's "true" branch |
| `publication-memory-updater` | Code node "Update Publication Memory" | Only reachable after "Publish WordPress Draft" succeeds |
| `workflow-observability-reporter` | Code node "Log Execution Event" | Called from every branch, including failure branches |
| Batch loops | `n8n-nodes-base.splitInBatches` (one for multi-perspective expansion, one for the publish batch) | Both MUST have their "loop" output eventually reconnect to themselves — resolves research.md R14 |
| Triggers | `n8n-nodes-base.scheduleTrigger` AND `n8n-nodes-base.manualTrigger` | Both wired to the same "Load Workflow Context" entry point |

## Processing rules (static validation)

1. `workflow.active` MUST be `false`.
2. No string anywhere in the serialized workflow may match a Groq-key shape (`gsk_...`) or a `Bearer <token>` pattern — credentials must only ever appear as n8n credential references.
3. No Code node's `jsCode`/`functionCode` may contain a `$('<node name>')`-style lookup — all data must arrive via explicit node input connections (resolves research.md R15).
4. Every node except trigger nodes must have at least one incoming or outgoing connection — an orphaned node (like the source workflow's disconnected `HTML` node) is an error (resolves research.md R13).
5. Every `splitInBatches` node's loop-body connections must eventually lead back to that same node (graph reachability check) — otherwise it will process only its first batch and silently drop the rest (resolves research.md R14).
6. Generic default node names (`HTTP Request`, `Code`, `Loop Over Items`, `IF`, `Switch`) are flagged as warnings, not errors — they still function, but obscure responsibility.

## Validation rules

- All 5 structural checks above run unconditionally; there is no "skip validation" mode.
- A `valid: false` result must block import/use of the workflow file — this skill's whole purpose is being the last static gate before the JSON is considered import-ready.

## Failure conditions

See the processing-rules table; each violation produces a specific, human-readable error string naming the offending node.

## Example invocation

```js
const { validateWorkflowJson } = require('./scripts/validate-workflow');
const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('n8n/generated/govconic-cmmc-content-publishing.json', 'utf8'));
const result = validateWorkflowJson(workflow);
if (!result.valid) {
  console.error(result.errors);
  process.exit(1);
}
```

## Example successful result

```json
{ "valid": true, "errors": [], "warnings": [] }
```

## Example failed result

```json
{
  "valid": false,
  "errors": [
    "Node \"HTML\" is orphaned — no incoming or outgoing connections",
    "splitInBatches node \"Loop Over Items1\" has a loop-body connection that never leads back to itself — it will only process its first batch"
  ],
  "warnings": []
}
```

## Dependencies

- Every other skill in `.specify/skills/` (it maps and wires them; it does not duplicate their logic).

## Security considerations

- The embedded-credential check is a defense-in-depth backstop, not a replacement for actually storing credentials in n8n's credential store — see `checklists/cmmc-workflow-security.md`.

## Testing requirements

- Unit tests (`tests/validate-workflow.test.js`): passes on a well-formed workflow; rejects `active: true`; rejects an embedded Groq-shaped key; rejects a fragile node-name lookup; rejects an orphaned node (the exact `HTML`-node defect from the source workflow); rejects a `splitInBatches` node whose loop never reconnects (the exact multi-perspective defect from the source workflow); accepts a correctly-looped `splitInBatches` node; warns (without failing) on a generic default node name.
