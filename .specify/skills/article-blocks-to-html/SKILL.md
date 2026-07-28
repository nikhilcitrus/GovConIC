---
name: article-blocks-to-html
description: Use to convert a normalized Article's body (ordered ContentBlock array) into sanitized WordPress-compatible HTML, plus plain text and word counts. Do not use this skill to decide whether the resulting article is acceptable — cmmc-oat-validator applies word/block-count rules using this skill's output as raw material.
version: 1.0.0
inputs:
  - name: body
    type: ContentBlock[]
    description: The ordered content-block array from a normalized Article (article-response-normalizer's output).
  - name: options.fallbackMode
    type: boolean
    description: Optional, default false. When true, an unrecognized block type renders as an explicit, escaped, clearly labeled diagnostic element instead of being rejected. Must be off in production; only ever enabled deliberately and covered by its own tests.
outputs:
  - name: valid
    type: boolean
    description: False when any block is malformed or (with fallbackMode off) has an unsupported type.
  - name: errors
    type: array
    description: "Structured errors, each { code, message, index, type? }."
  - name: html
    type: string
    description: Sanitized HTML, blocks joined in original order. null when valid is false.
  - name: plainText
    type: string
    description: HTML with tags stripped and entities decoded. null when valid is false.
  - name: paragraphWordCount
    type: number
    description: Word count summed only across "p" blocks.
  - name: fullWordCount
    type: number
    description: Word count across the entire rendered plain text (all block types).
dependencies:
  - article-response-normalizer (produces the body array this skill consumes)
---

## Purpose

Turn structured content blocks into HTML WordPress can safely store and render — with zero guessing about unknown block types and zero unescaped user/LLM-controlled text reaching the page.

## When to use

- Immediately after `article-response-normalizer` produces a valid `Article`, before `cmmc-oat-validator` runs (the validator needs both the block-level counts and the rendered word counts).

## When not to use

- Do not use this skill to apply the OAT's word-count/block-count acceptance rules — it only reports counts; `cmmc-oat-validator` decides pass/fail against `validation-config.json`.
- Do not enable `fallbackMode` in the production pipeline — it exists only for a deliberate, explicitly configured, tested degradation path, never as a default behavior (resolves research.md R12).

## Required inputs

`body` must be an array. An empty array or a block missing `type` are both valid (rejectable) inputs, not thrown errors — this skill reports structured failures rather than throwing, so the caller can route the run to `oat_failed`/`normalization_failed` style reporting.

## Output contract

`{ valid, errors, html, plainText, paragraphWordCount, fullWordCount }`. When `valid: false`, `html`/`plainText` are `null` — never a partially-rendered string, since a partial render of a rejected article is exactly the "guessed HTML" failure mode being eliminated.

## Processing rules

1. For each block, dispatch on `type` to its exact HTML mapping: `p`→`<p>`, `h2`→`<h2>`, `h3`→`<h3>`, `h4`→`<h4>`, `stat`→a semantic `<div class="stat">` with value/label spans, `pullquote`→`<blockquote>`, `list`→`<ul><li>...</li></ul>`, `callout`→`<div class="callout">`.
2. Escape all block text/value/label/list-item content (`&`, `<`, `>`, `"`, `'`) before interpolating into HTML.
3. Preserve block order exactly — blocks are joined in array order, never reordered or grouped.
4. An unsupported `type` is rejected by default (`errors: [{code: 'unsupported_block_type', ...}]`, whole result `valid: false`) rather than rendered via any heuristic. When `fallbackMode` is explicitly enabled, render it instead as `<div class="unrecognized-block" data-block-type="...">` containing the fully escaped, stringified block — a deliberate, safe, labeled degradation, never a guess at which property is "the heading" (resolves research.md R12).
5. Compute `paragraphWordCount` from `p` blocks only; compute `fullWordCount` from the entire stripped plain text.

## Validation rules

- Every block MUST have a string `type`.
- With `fallbackMode` off (the default), `type` MUST be one of the 8 supported values.
- HTML escaping MUST be applied to all user/LLM-controlled text before it is included in `html`.

## Failure conditions

| Condition | Result |
|---|---|
| `body` is not an array | `valid: false`, `errors: [{code: 'invalid_body'}]` |
| A block has no string `type` | `valid: false`, `errors: [{code: 'invalid_block', index}]` |
| A block's `type` is unsupported and `fallbackMode` is off | `valid: false`, `errors: [{code: 'unsupported_block_type', index, type}]` |

## Example invocation

```js
const { convertBlocksToHtml } = require('./scripts/blocks-to-html');
const result = convertBlocksToHtml(article.body);
```

## Example successful result

```json
{
  "valid": true,
  "errors": [],
  "html": "<p>...</p>\n<h2>...</h2>\n<p>...</p>\n<div class=\"stat\">...</div>\n<h2>...</h2>\n<p>...</p>\n<blockquote>...</blockquote>\n<p>...</p>\n<div class=\"callout\">...</div>",
  "plainText": "... plain text ...",
  "paragraphWordCount": 138,
  "fullWordCount": 210
}
```

## Example failed result

```json
{
  "valid": false,
  "errors": [{ "code": "unsupported_block_type", "message": "Block at index 2 has unsupported type \"quote2\"...", "index": 2, "type": "quote2" }],
  "html": null,
  "plainText": null,
  "paragraphWordCount": 0,
  "fullWordCount": 0
}
```

## Dependencies

- `article-response-normalizer` for the `body` input.

## Security considerations

- All interpolated text is HTML-escaped — this is the last line of defense before content is stored in WordPress and rendered to real visitors.
- `fallbackMode`'s diagnostic rendering still escapes the entire stringified block, so even a malicious/malformed unknown block cannot inject markup.

## Testing requirements

- Unit tests (`tests/blocks-to-html.test.js`): all 8 block-type mappings with order preservation, HTML escaping, unsupported-type rejection by default, explicit fallback-mode rendering, plain-text derivation, paragraph-only vs. full-body word count, non-array/missing-type rejection.
