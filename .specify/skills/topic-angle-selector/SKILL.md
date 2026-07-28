---
name: topic-angle-selector
description: Use immediately after workflow-context-manager to pick a specific narrow CMMC topic, confirm the lead angle, and decide standard vs. multi-perspective generation mode. Do not use this skill to rotate format/lead-angle state (that is workflow-context-manager's job) or to build LLM prompts (that is cmmc-editorial-prompt-builder's job).
version: 1.0.0
inputs:
  - name: context
    type: WorkflowContext
    description: Output of workflow-context-manager — must include selectedFormat, selectedLeadAngle, avoidedTopics, normalizedSourceArticle.
  - name: config
    type: object
    description: "{ topics: string[], multiPerspectiveFormatMarker: string } — read from editorial-config.json."
  - name: seed
    type: string
    description: Optional. When present, topic selection is deterministic.
outputs:
  - name: rejected
    type: boolean
    description: True when multi-perspective mode was selected but no usable source article is available.
  - name: reason
    type: string
    description: Present only when rejected is true (e.g. "source-unusable").
  - name: generationMode
    type: string
    description: "'standard' or 'multiPerspective'."
  - name: topic
    type: string
    description: The selected narrow CMMC topic (absent when rejected).
  - name: leadAngle
    type: string
    description: Passed through from context.selectedLeadAngle.
  - name: format
    type: string
    description: Passed through from context.selectedFormat.
dependencies:
  - workflow-context-manager (must run first)
  - editorial-config.json (topics list, multi-perspective format marker)
---

## Purpose

Turn the rotation-level decisions already made by `workflow-context-manager` (which format, which lead angle) into a concrete, avoided-topic-aware subject for this run, and gate multi-perspective mode on having real source material.

## When to use

- Immediately after `workflow-context-manager` on every run, before `cmmc-editorial-prompt-builder` or `multi-perspective-planner`.

## When not to use

- Do not use this skill to advance rotation counters — `context.selectedFormat`/`selectedLeadAngle` are already decided by the time this skill runs.
- Do not use this skill to fetch or sanitize source article content — it only reads `context.normalizedSourceArticle.usable`, which `source-content-extractor` (via `workflow-context-manager`) must have already set.

## Required inputs

See frontmatter. `context.selectedFormat` and `config.topics`/`config.multiPerspectiveFormatMarker` are all required; missing any of them fails fast.

## Output contract

See frontmatter `outputs`. When `rejected: true`, the workflow must not proceed to `cmmc-editorial-prompt-builder` or `multi-perspective-planner` for this run (resolves research.md R13 — no silent blank-context generation).

## Processing rules

1. Compare `context.selectedFormat` to `config.multiPerspectiveFormatMarker`. Equal → multi-perspective mode.
2. In multi-perspective mode, require `context.normalizedSourceArticle.usable === true`; otherwise return a rejection instead of proceeding (FR-010).
3. Build the exclusion set from `context.avoidedTopics` (already includes configured baseline topics plus pending follow-on topics per `workflow-context-manager`).
4. Filter `config.topics` down to those not in the exclusion set (case-insensitive, trimmed comparison).
5. If every configured topic has been avoided recently, fall back to the full topic list rather than failing the run — this degradation is intentional and documented, not silent.
6. Pick the first eligible topic, or — when `seed` is supplied — a deterministic index into the eligible list so the same seed always yields the same topic.

## Validation rules

- `config.topics` MUST be a non-empty array (FR-044 — no in-code topic list).
- `config.multiPerspectiveFormatMarker` MUST be present and MUST exactly match one entry in the formats list `workflow-context-manager` rotates over.

## Failure conditions

| Condition | Result |
|---|---|
| `context.selectedFormat` missing | Throws — context-manager must run first |
| `config.topics` missing/empty | Throws — fail fast per FR-045 |
| `config.multiPerspectiveFormatMarker` missing | Throws |
| Multi-perspective format selected, source not usable | Returns `{ rejected: true, reason: 'source-unusable' }` (not a throw — this is an expected run outcome, not a configuration error) |

## Example invocation

```js
const { selectTopicAndMode } = require('./scripts/topic-angle-selector');

const result = selectTopicAndMode({
  context: {
    selectedFormat: 'contrarian-analysis',
    selectedLeadAngle: 'Innovative',
    avoidedTopics: ['What is CMMC 2.0'],
    normalizedSourceArticle: null
  },
  config: {
    topics: ['SPRS score submission accuracy', 'POA&M closure timelines', 'C3PAO surveillance findings'],
    multiPerspectiveFormatMarker: 'multi-perspective-source-analysis'
  }
});
```

## Example successful result

```json
{
  "rejected": false,
  "generationMode": "standard",
  "topic": "SPRS score submission accuracy",
  "leadAngle": "Innovative",
  "format": "contrarian-analysis"
}
```

## Example failed result

```json
{ "rejected": true, "reason": "source-unusable", "generationMode": "multiPerspective" }
```

## Dependencies

- `workflow-context-manager` (must execute first in every run).
- `editorial-config.json` for the topic pool and multi-perspective marker.

## Security considerations

- Handles only editorial metadata (topic strings, format/angle labels) — no credentials, no raw source HTML.

## Testing requirements

- Unit tests (`tests/topic-angle-selector.test.js`): standard-mode selection, avoided-topic exclusion, all-avoided fallback, deterministic seeding, multi-perspective acceptance with a usable source, multi-perspective rejection with an unusable source, fail-fast on missing config.
