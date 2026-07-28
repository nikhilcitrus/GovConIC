---
name: workflow-context-manager
description: Use at the start of every CMMC content-publishing run to load prior workflow memory, advance format/lead-angle rotation, trim caches to their configured limits, and expose one normalized context object to every downstream skill. Do not use this skill to persist post-publication history (headlines, posted URLs/titles/hashes) — that is publication-memory-updater's responsibility, gated on confirmed publish success.
version: 1.0.0
inputs:
  - name: memory
    type: WorkflowMemory
    description: Prior-run persisted state (rotation indices, recent headlines, pending follow-on topics, duplicate history). See data-model.md#workflowmemory.
  - name: config
    type: object
    description: "{ formats: string[], leadAngles: string[], avoidedBaselineTopics: string[], cacheLimits: { recentHeadlines, pendingFollowOnTopics, duplicateHistory } } — read from editorial-config.json."
  - name: runId
    type: string
    description: Unique identifier for this workflow execution, used in all downstream logging.
  - name: seed
    type: string
    description: Optional. When present, format/lead-angle selection is deterministic and rotation state is not advanced.
  - name: dryRun
    type: boolean
    description: Optional. Propagated into the context so downstream skills can short-circuit external calls.
  - name: incomingSourceArticle
    type: object
    description: Optional raw upstream object (e.g. from source-content-extractor or an RSS/scrape node) to normalize into the context.
outputs:
  - name: context
    type: WorkflowContext
    description: Normalized context object — see data-model.md#workflowcontext. Includes selectedFormat, selectedLeadAngle, recentHeadlines, avoidedTopics, normalizedSourceArticle, generationMode (left null for topic-angle-selector to set), runId, dryRun, seed.
  - name: updatedMemory
    type: WorkflowMemory
    description: Memory with rotation indices advanced (unless seeded). The calling workflow persists this immediately, regardless of publish outcome — rotation variety is not gated on publication success.
dependencies:
  - editorial-config.json (formats, lead angles, avoided baseline topics, cache limits)
---

## Purpose

Give every other skill in the pipeline one normalized, storage-agnostic view of "where the workflow is right now" — what format/angle to use this run, what to avoid, what source material (if any) is in play — without any of them needing to know how or where memory is persisted.

## When to use

- At the very start of every run, immediately after the trigger (manual or schedule) fires and before topic/angle selection.
- Whenever a test harness needs to simulate "the Nth run" of the pipeline (via the `seed` input for determinism).

## When not to use

- Do not use this skill to record the outcome of a run. Recording happens only in `publication-memory-updater`, and only after a WordPress draft is confirmed created (resolves research.md R9 — duplicate caches must never update before publish success).
- Do not use this skill to pick the actual CMMC topic or decide standard-vs-multi-perspective mode — that narrower decision belongs to `topic-angle-selector`, which consumes this skill's `selectedFormat` output.

## Required inputs

See frontmatter `inputs`. `memory` and `config` are the two load-bearing inputs; `config.formats` and `config.leadAngles` are required and must be non-empty or this skill fails fast (FR-045).

## Output contract

See frontmatter `outputs`. The `context.generationMode` field is intentionally left `null` here — `topic-angle-selector` sets it to `standard` or `multiPerspective` based on whether `selectedFormat` matches the configured multi-perspective marker.

## Processing rules

1. Read `formatRotationIndex` / `leadAngleRotationIndex` from `memory` (default `0` if absent).
2. If `seed` is supplied: derive both indices deterministically from the seed (same seed → same selection, every time) and do **not** advance `updatedMemory`'s rotation indices.
3. If no `seed`: select `config.formats[index % length]` / `config.leadAngles[index % length]`, then advance each index by 1 (wrapping via modulo) in `updatedMemory`.
4. Trim `memory.recentHeadlines` to `cacheLimits.recentHeadlines` and `memory.pendingFollowOnTopics` to `cacheLimits.pendingFollowOnTopics` (default 15 / 30).
5. Compute `avoidedTopics` as `config.avoidedBaselineTopics` concatenated with the trimmed `pendingFollowOnTopics`.
6. If `incomingSourceArticle` is supplied, normalize it into `{ title, url, content, usable }`, where `usable` is `false` whenever `title` or `content` is empty after trimming.

## Validation rules

- `config.formats` and `config.leadAngles` MUST be non-empty arrays — fail fast otherwise (no silent fallback list).
- `runId` MUST be present.
- Rotation indices MUST always be reduced modulo the current list length, so a shorter reconfigured list never produces an out-of-bounds selection.

## Failure conditions

| Condition | Result |
|---|---|
| `config.formats` missing/empty | Throws `workflow-context-manager: config.formats is required and must be non-empty` |
| `config.leadAngles` missing/empty | Throws `workflow-context-manager: config.leadAngles is required and must be non-empty` |
| `runId` missing | Throws `workflow-context-manager: runId is required` |

## Example invocation

```js
const { loadWorkflowContext } = require('./scripts/context-manager');

const { context, updatedMemory } = loadWorkflowContext({
  memory: { formatRotationIndex: 2, recentHeadlines: ['Prior Headline'] },
  config: {
    formats: ['policy-update', 'explainer', 'contrarian'],
    leadAngles: ['Unobvious', 'Under the Radar', 'Innovative'],
    avoidedBaselineTopics: ['What is CMMC 2.0'],
    cacheLimits: { recentHeadlines: 15, pendingFollowOnTopics: 30, duplicateHistory: 300 }
  },
  runId: 'run-2026-07-28T00:00:00Z',
  dryRun: false
});
```

## Example successful result

```json
{
  "context": {
    "runId": "run-2026-07-28T00:00:00Z",
    "dryRun": false,
    "seed": null,
    "selectedFormat": "contrarian",
    "selectedLeadAngle": "Innovative",
    "recentHeadlines": ["Prior Headline"],
    "avoidedTopics": ["What is CMMC 2.0"],
    "normalizedSourceArticle": null,
    "generationMode": null
  },
  "updatedMemory": { "formatRotationIndex": 0, "leadAngleRotationIndex": 1, "recentHeadlines": ["Prior Headline"] }
}
```

## Example failed result

```
Error: workflow-context-manager: config.formats is required and must be non-empty
```

## Dependencies

- `editorial-config.json` (formats, lead angles, avoided baseline topics, cache limits) — no dependency on any other skill's runtime output.

## Security considerations

- Never persists or logs credentials — this skill only ever handles editorial rotation state and article metadata.
- `normalizedSourceArticle.content` may contain third-party HTML; this skill does not sanitize it (that is `source-content-extractor`'s job) — treat it as untrusted until sanitized.

## Testing requirements

- Unit tests (see `tests/context-manager.test.js`): rotation advance, rotation wraparound, seeded determinism (no memory mutation), avoided-topics composition, cache trimming, unusable-source detection, fail-fast on missing config.
- Any change to cache-limit defaults must have a corresponding test asserting the new default.
