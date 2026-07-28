---
name: multi-perspective-planner
description: Use only when topic-angle-selector has determined generationMode = multiPerspective (and therefore already confirmed a usable source article) to expand one source article into exactly three independent GenerationRequest objects — Executive, Engineering, Compliance. Do not use this skill for standard single-article generation, and do not call it with an unusable source article — it enforces that guard itself.
version: 1.0.0
inputs:
  - name: groupId
    type: string
    description: Caller-supplied unique id shared by all 3 requests (e.g. derived from the n8n execution id). This skill never generates timestamps or ids itself, to stay a pure, deterministically-testable function.
  - name: topic
    type: string
  - name: leadAngle
    type: string
  - name: avoidTopics
    type: string[]
  - name: recentHeadlines
    type: string[]
  - name: sourceArticle
    type: SourceArticle
    description: Must have usable === true — this skill throws otherwise, it does not degrade silently.
outputs:
  - name: requests
    type: GenerationRequest[]
    description: Exactly 3 objects (Executive, Engineering, Compliance), each carrying the shared groupId, its own perspective and perspectiveInstructions, and the same sourceReference.
dependencies:
  - topic-angle-selector (must have already set generationMode = multiPerspective and confirmed a usable source)
  - source-content-extractor (produces the SourceArticle passed in)
---

## Purpose

Fan one source article out into three fully independent, perspective-specific generation requests — Executive, Engineering, Compliance — so a single industry event produces diversified coverage without hand-authoring three briefs.

## When to use

- Only after `topic-angle-selector` returns `generationMode: 'multiPerspective'` for this run (which itself only happens when a usable source article exists).

## When not to use

- Never for standard (non-multi-perspective) generation — use `cmmc-editorial-prompt-builder` directly with the single `GenerationRequest` from `topic-angle-selector` instead.
- Never with a `sourceArticle` whose `usable` flag is `false` — this skill throws rather than emitting three blank-context requests (resolves research.md R13).

## Required inputs

`groupId`, `topic`, `sourceArticle` (with `usable: true`) are all required. `leadAngle`, `avoidTopics`, `recentHeadlines` are passed straight through to each of the three requests.

## Output contract

Exactly 3 `GenerationRequest` objects, one per `perspective` value (`Executive`, `Engineering`, `Compliance`), all sharing one `groupId` and the same `sourceReference`. Each carries perspective-specific `perspectiveInstructions` text (see Processing rules). No instruction text ever names a specific site brand — the publication identity ("GovConIC — The Government Contractor Intelligence Center") is applied later, in `cmmc-editorial-prompt-builder`, not embedded here (resolves research.md R11).

## Processing rules

1. Executive instructions target CEOs, CIOs, CTOs, CISOs, boards, and government contractors — strategic risk, business impact, leadership decisions.
2. Engineering instructions target DevSecOps/engineering teams — evidence automation, secure software development, continuous compliance, AI-assisted engineering, operational excellence.
3. Compliance instructions target compliance/risk teams — CMMC, NIST SP 800-171, DIBCAC assessments, False Claims Act implications, evidence generation, audit readiness.
4. All 3 requests are built from the same `topic`/`leadAngle`/`avoidTopics`/`recentHeadlines`/`sourceArticle` inputs — only `perspective` and `perspectiveInstructions` differ.

## Validation rules

- `sourceArticle.usable` MUST be `true` — checked defensively even though `topic-angle-selector` should have already gated on this, since this skill must never be the single point of failure for research.md R13.
- Output MUST contain exactly 3 items — enforced as an internal invariant check, not just an expectation.

## Failure conditions

| Condition | Result |
|---|---|
| `sourceArticle` missing or `usable !== true` | Throws `a usable sourceArticle is required for multi-perspective planning` |
| `groupId` missing | Throws `groupId is required` |
| `topic` missing | Throws `topic is required` |

## Example invocation

```js
const { planMultiPerspectiveRequests } = require('./scripts/multi-perspective-planner');

const requests = planMultiPerspectiveRequests({
  groupId: 'exec-2026-07-28-001',
  topic: 'DIBCAC assessment findings trend',
  leadAngle: 'Under the Radar',
  avoidTopics: ['What is CMMC 2.0'],
  recentHeadlines: [],
  sourceArticle: { title: 'DoD Finalizes CMMC 2.0 Rule', url: 'https://...', content: '...', usable: true }
});
```

## Example successful result

```json
[
  { "perspective": "Executive", "groupId": "exec-2026-07-28-001", "topic": "DIBCAC assessment findings trend", "...": "..." },
  { "perspective": "Engineering", "groupId": "exec-2026-07-28-001", "topic": "DIBCAC assessment findings trend", "...": "..." },
  { "perspective": "Compliance", "groupId": "exec-2026-07-28-001", "topic": "DIBCAC assessment findings trend", "...": "..." }
]
```

## Example failed result

```
Error: multi-perspective-planner: a usable sourceArticle is required for multi-perspective planning
```

## Dependencies

- `topic-angle-selector` for generation-mode decision and gating.
- `source-content-extractor` for the `SourceArticle` input.

## Security considerations

- Passes `sourceArticle.content` through unchanged — it must already be sanitized by `source-content-extractor` before reaching this skill; this skill performs no additional sanitization of its own.

## Testing requirements

- Unit tests (`tests/multi-perspective-planner.test.js`): exactly-3-requests invariant, shared group id and source reference, distinct non-empty perspective instructions, throw on unusable source, throw on missing group id, no legacy brand string in any generated text.
