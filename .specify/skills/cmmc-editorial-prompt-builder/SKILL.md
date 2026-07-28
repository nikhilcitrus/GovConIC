---
name: cmmc-editorial-prompt-builder
description: Use to turn a GenerationRequest (from topic-angle-selector, or one of the three from multi-perspective-planner) into a provider-neutral LLM request. Owns all editorial-rule text (word/block counts, subtitle requirement, brand, voice, exclusions) so none of it lives inside n8n Code nodes. Do not use this skill to call the LLM (llm-content-generator's job) or to decide topic/format/angle (topic-angle-selector's job).
version: 1.0.0
inputs:
  - name: generationRequest
    type: GenerationRequest
    description: From topic-angle-selector (standard mode) or multi-perspective-planner (one of 3, multi-perspective mode).
  - name: editorialConfig
    type: object
    description: "{ brand, audience, voiceDescription } — read from editorial-config.json. brand MUST be 'GovConIC — The Government Contractor Intelligence Center', never the legacy Federal Architect name."
  - name: validationConfig
    type: object
    description: "Canonical word/block-count rule — paragraphCount, h2Count, statCount, pullquoteCount, calloutCount, paragraphWordMin/Max, totalWordMin/Max — read from validation-config.json. Single source of truth so the prompt and the OAT gate can never drift apart."
  - name: providerConfig
    type: object
    description: "{ model, temperature, maxTokens } — read from provider-config.json. No credential values."
outputs:
  - name: request
    type: object
    description: Provider-neutral LLM request matching contracts/llm-request.schema.json — { model, response_format, max_tokens, temperature, messages }.
dependencies:
  - topic-angle-selector or multi-perspective-planner (produces the GenerationRequest input)
  - editorial-config.json, validation-config.json, provider-config.json
---

## Purpose

Be the single place where "what does a compliant CMMC article look like" is written down in prose — so the rule the LLM is told, and the rule `cmmc-oat-validator` enforces, are generated from the exact same `validationConfig` values and can never silently drift apart (resolves research.md R1, R2, R5, R6).

## When to use

- Once per `GenerationRequest`: once for standard mode, three times (once per perspective) for multi-perspective mode.

## When not to use

- Do not use this skill to make the actual HTTP call to the LLM provider — that's `llm-content-generator`.
- Do not use this skill to decide the topic, format, lead angle, or generation mode — those are already decided by the time a `GenerationRequest` reaches this skill.

## Required inputs

All three config objects and a `generationRequest` with at least `topic` set. See frontmatter.

## Output contract

A request object matching `contracts/llm-request.schema.json`: `{ model, response_format: {type:'json_object'}, max_tokens, temperature, messages: [{role:'system', content}, {role:'user', content}] }`. The request body never contains a credential field of any kind (verified by a dedicated unit test) — credentials travel via `llm-content-generator`'s HTTP call configuration, never in the request body this skill produces.

## Processing rules

1. Render `templates/system-prompt.md` with `editorialConfig` (brand/audience/voice) and `validationConfig` (paragraph/h2/stat/pullquote/callout counts, word min/max) substituted in — the counts are never hardcoded prose, so changing `validation-config.json` changes both the prompt and the gate together.
2. Render `templates/user-prompt.md` with the generation request's `topic`, `format`, `leadAngle`, joined `avoidTopics`, and joined `recentHeadlines`.
3. When `generationRequest.perspective` is set, append an analysis-preamble block naming the perspective and its instructions, and referencing `sourceReference.title`/`.url` for attribution — using the configured brand only, never a hardcoded site domain (resolves research.md R11).
4. Assemble the final request with `providerConfig.model`/`temperature`/`maxTokens` and the two rendered messages.

## Validation rules

- `editorialConfig.brand` MUST be present — the skill fails fast rather than falling back to any embedded brand string.
- `validationConfig` MUST supply every count/word-limit key the template needs — a missing key raises a clear "missing template variable" error rather than rendering `undefined` into the prompt.
- The subtitle requirement is always present in the rendered schema block — there is no code path that omits it (resolves research.md R3).

## Failure conditions

| Condition | Result |
|---|---|
| `generationRequest.topic` missing | Throws |
| `editorialConfig.brand` missing | Throws |
| `validationConfig` missing | Throws |
| `providerConfig.model` missing | Throws |
| A template references a variable not supplied | Throws `missing template variable "<name>"` |

## Example invocation

```js
const { buildGenerationRequest } = require('./scripts/prompt-builder');

const request = buildGenerationRequest({
  generationRequest: {
    topic: 'SPRS score submission accuracy',
    format: 'a contrarian piece challenging a common assumption',
    leadAngle: 'Unobvious',
    avoidTopics: ['What is CMMC 2.0'],
    recentHeadlines: ['Old Headline']
  },
  editorialConfig: {
    brand: 'GovConIC — The Government Contractor Intelligence Center',
    audience: 'mid-market government contractors with $20M-$500M in revenue'
  },
  validationConfig: {
    paragraphCount: 4, h2Count: 2, statCount: 1, pullquoteCount: 1, calloutCount: 1,
    paragraphWordMin: 20, paragraphWordMax: 50, totalWordMin: 100, totalWordMax: 200
  },
  providerConfig: { model: 'llama-3.3-70b-versatile', temperature: 0.7, maxTokens: 2000 }
});
```

## Example successful result

```json
{
  "model": "llama-3.3-70b-versatile",
  "response_format": { "type": "json_object" },
  "max_tokens": 2000,
  "temperature": 0.7,
  "messages": [
    { "role": "system", "content": "You are a professional journalist writing for GovConIC..." },
    { "role": "user", "content": "Write a piece with the following parameters..." }
  ]
}
```

## Example failed result

```
Error: cmmc-editorial-prompt-builder: editorialConfig.brand is required
```

## Dependencies

- `topic-angle-selector` / `multi-perspective-planner` for the `GenerationRequest` input.
- `editorial-config.json`, `validation-config.json`, `provider-config.json`.

## Security considerations

- Never embeds a credential in the rendered prompt or the returned request object — verified by a dedicated unit test that checks for `apiKey`/`api_key`/`authorization` keys and the `gsk_` prefix.
- Source content (via `perspectiveInstructions`/`sourceReference`) must already be sanitized by `source-content-extractor` before it reaches this skill.

## Testing requirements

- Unit tests (`tests/prompt-builder.test.js`): contract shape, single unambiguous paragraph/h2 rule (no "eight paragraphs" or "2-3" phrasing survives), subtitle present in schema, GovConIC branding present and legacy brand absent, avoided-topics/recent-headlines inclusion, perspective block conditional inclusion, no credential-shaped field, fail-fast on missing config.
