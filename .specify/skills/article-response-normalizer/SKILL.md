---
name: article-response-normalizer
description: Use to parse the raw LLM response string from llm-content-generator into the canonical Article shape, rejecting non-JSON responses, normalizing alternative field names, and independently requiring every identity field (including subtitle — never backfilled from dek). Do not use this skill to enforce companion-asset minimums, word-count ranges, CMMC relevance, or duplicate detection — those are cmmc-oat-validator's job.
version: 1.0.0
inputs:
  - name: rawContent
    type: string
    description: The raw string from llm-content-generator's `content` output (still JSON-encoded text at this point).
outputs:
  - name: valid
    type: boolean
    description: True only when every always-required identity field is present and body is a non-empty array. Note that a "valid" article here may still fail cmmc-oat-validator's business-rule checks — this is a shape check, not an acceptance decision.
  - name: errors
    type: array
    description: "Structured errors, each { code, message, field? }. Non-fatal entries (e.g. bodyWordCount mismatch) carry severity: 'warning' and do not affect `valid`."
  - name: article
    type: object
    description: The normalized Article (see data-model.md#article and schemas/article.schema.json), returned even when invalid, for diagnostics.
dependencies:
  - llm-content-generator (produces rawContent)
---

## Purpose

Be the one place a raw LLM string either becomes a trustworthy `Article` object or is rejected outright — no silent fallback substitutions, no discarded fields, no trusting the LLM's self-reported word count.

## When to use

- Immediately after `llm-content-generator` returns `content`, for every generation attempt (standard or per-perspective).

## When not to use

- Do not use this skill to decide whether an article is *good enough* to publish — word-count ranges, CMMC-term relevance, duplicate detection, prohibited-language screening, and companion-asset length minimums are all `cmmc-oat-validator`'s job, not this skill's.
- Do not use this skill to render HTML — that's `article-blocks-to-html`, which consumes this skill's `article.body` output.

## Required inputs

`rawContent` — a string. Empty string, malformed JSON, and a JSON array/primitive are all valid (rejectable) inputs, not programming errors.

## Output contract

`{ valid, errors, article }`. `article` always has the full `Article` shape populated (with empty-string/empty-array defaults for missing companion-asset fields), even when `valid: false`, so a normalization failure is fully diagnosable.

## Processing rules

1. `JSON.parse(rawContent)`. Any parse failure returns `valid: false` with `errors: [{code: 'invalid_json', ...}]` and `article: null` — never a partial-recovery attempt (FR-019).
2. Reject non-object (array/primitive) parsed values the same way, with `code: 'invalid_shape'`.
3. Locate the body block array from `body`, falling back to `content`/`article`/`sections` only for the array-of-blocks itself (alternate LLM field-naming drift) — never for individual identity fields like `subtitle`.
4. Map alternate companion-asset field names (`alternativeTitles`/`titleOptions`/`titles` → `altTitles`; `linkedInPost`/`linkedin_post` → `linkedinPost`; etc.) via `pickField`.
5. Normalize array-or-string companion fields via `asArray` (splits newline/pipe-separated strings).
6. Calculate `bodyWordCount` by summing words in every `type: 'p'` block — this calculated value is always what's returned as `article.bodyWordCount`, regardless of what the LLM self-reported (resolves research.md R7).
7. If the LLM's self-reported `bodyWordCount` disagrees with the calculated value, record a **non-fatal warning** (does not flip `valid` to false) — this is observability, not a blocker; `cmmc-oat-validator` is the actual word-count gate.
8. Independently check presence of every identity field — `headline`, `slug`, `section`, `kicker`, `subtitle`, `dek`, `byline`, `date`, `readMinutes` — and a non-empty `body`. Each missing field is its own error with its own `field` name; `subtitle` is never considered "present" because `dek` or `kicker` has a value (resolves research.md R3/R4).

## Validation rules

- `subtitle` MUST be independently required — no substitution logic of any kind.
- `bodyWordCount` in the output MUST always be the calculated paragraph-only count, never the LLM's self-reported value.
- A structurally-thin-but-parseable article (e.g. only 2 alt titles) is still `valid: true` here — that is intentionally left to `cmmc-oat-validator` so the eventual rejection reason is specific ("fewer than 5 alt titles") rather than a generic normalization failure.

## Failure conditions

| Condition | Result |
|---|---|
| `rawContent` is not valid JSON | `valid: false`, `errors: [{code: 'invalid_json'}]`, `article: null` |
| Parsed value is an array or primitive | `valid: false`, `errors: [{code: 'invalid_shape'}]`, `article: null` |
| Any identity field (including `subtitle`) missing/empty | `valid: false`, one `missing_required_field` error per missing field |
| `body` missing or empty | `valid: false`, `errors: [{code: 'empty_body'}]` |
| LLM-reported `bodyWordCount` disagrees with calculated value | `valid` unaffected; one `warning`-severity `body_word_count_mismatch` entry |

## Example invocation

```js
const { normalizeArticleResponse } = require('./scripts/normalize-article');
const result = normalizeArticleResponse(llmContentGeneratorOutput.content);
```

## Example successful result

```json
{
  "valid": true,
  "errors": [],
  "article": {
    "headline": "A Real Headline About CMMC",
    "subtitle": "A thirty-to-forty word standalone subtitle...",
    "bodyWordCount": 132,
    "body": [ "..." ],
    "altTitles": ["...", "...", "...", "...", "..."]
  }
}
```

## Example failed result

```json
{
  "valid": false,
  "errors": [{ "code": "missing_required_field", "message": "Missing required field: subtitle", "field": "subtitle" }],
  "article": { "subtitle": "", "dek": "A short one-sentence deck.", "...": "..." }
}
```

## Dependencies

- `llm-content-generator` (produces the raw string this skill parses).

## Security considerations

- Never executes or evaluates any part of the parsed content — `JSON.parse` only, no `eval`.
- Does not sanitize HTML — `article.body` block text may still contain unsafe markup at this stage; `article-blocks-to-html` is responsible for escaping it before rendering.

## Testing requirements

- Unit tests (`tests/normalize-article.test.js`): full valid-article round trip, non-JSON rejection, missing-subtitle independence from dek, alternate field-name normalization, array-or-string normalization, paragraph-only word-count calculation, self-reported-vs-calculated word-count warning, empty-body rejection, non-object-shape rejection.
