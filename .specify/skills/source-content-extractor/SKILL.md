---
name: source-content-extractor
description: Use whenever a run needs a real source article — primarily ahead of multi-perspective-planner — to normalize an upstream CSS-selector extraction into a sanitized {title, url, content, usable} shape. Do not use this skill to perform the CSS-selector query itself (that is n8n's native HTML node, configured with this skill's selectors); this skill sanitizes and judges usability of whatever that node already extracted.
version: 1.0.0
inputs:
  - name: extracted
    type: object
    description: "Raw upstream extraction, e.g. { title, content } from n8n's HTML node using the configured CSS selectors."
  - name: url
    type: string
    description: The source article's URL, preserved for attribution and duplicate-by-URL checks.
  - name: selectors
    type: object
    description: "{ title: '.css-selector', content: '.css-selector' } — carried through for observability only; not re-applied by this skill."
  - name: minContentLength
    type: number
    description: "Optional, default 40. Below this character count, content is treated as unusable."
outputs:
  - name: SourceArticle
    type: object
    description: "{ title, url, content, usable } — see data-model.md#sourcearticle."
dependencies:
  - n8n native HTML node (n8n-nodes-base.html) configured with this skill's selectors
  - editorial-config.json (default/override selector values)
---

## Purpose

Turn whatever the upstream CSS-selector extraction node produced into a trustworthy, sanitized `SourceArticle` — and make an explicit, checkable call on whether it's actually usable — so downstream skills never have to guess whether "empty string" means "no source" or "source happened to be blank."

## When to use

- Before `multi-perspective-planner`, whenever multi-perspective generation is a possibility for this run.
- Any time a source article reference is available and its content needs to enter an LLM prompt (never send raw unsanitized HTML into a prompt).

## When not to use

- Do not use this skill to fetch the source article over HTTP or to run CSS selectors against raw HTML — that is the upstream n8n HTML node's job. This skill only processes what that node already returned.
- Do not use this skill for the article being generated (the `Article` entity) — it is exclusively for the reference/source material.

## Required inputs

`extracted` (even if both fields are empty strings — that's a valid, checkable input, not an error). `url` and `selectors` are optional but recommended for attribution and observability.

## Output contract

A `SourceArticle`: `{ title, url, content, usable }`. `usable` is `false` whenever `title` is empty or `content` is shorter than `minContentLength` after sanitization — callers (`topic-angle-selector`, `multi-perspective-planner`) must treat `usable: false` as a hard stop for source-dependent generation, not a soft warning (resolves research.md R13).

## Processing rules

1. Strip `<script>`/`<style>` blocks entirely (content and markup) before any other processing.
2. Strip all remaining HTML tags, decode common entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, `&nbsp;`), and collapse whitespace.
3. Preserve `url` unchanged (never sanitized/rewritten) — it is used verbatim for attribution and duplicate-by-URL detection downstream.
4. Compute `usable` from the sanitized `title`/`content`, never from the raw input.

## Validation rules

- `title` must be non-empty after sanitization to be usable.
- `content` must be at least `minContentLength` characters (default 40) after sanitization to be usable.
- Sanitization MUST run before any content reaches `cmmc-editorial-prompt-builder` or `multi-perspective-planner` — no skill downstream of this one may accept raw HTML as source content.

## Failure conditions

This skill never throws for empty/unusable input — an empty or short source article is an expected, valid outcome (`usable: false`), not a configuration error. It only throws if called with a non-object `extracted` value where a string was expected internally (defensive, not part of the documented contract).

## Example invocation

```js
const { extractSourceArticle } = require('./scripts/source-extractor');

const source = extractSourceArticle({
  extracted: {
    title: '<h1>DoD Finalizes CMMC 2.0 Rule</h1>',
    content: '<div class="td-post-content">Full article text goes here...</div>'
  },
  url: 'https://example-industry-news.com/cmmc-final-rule',
  selectors: { title: 'h1', content: '.td-post-content' }
});
```

## Example successful result

```json
{
  "title": "DoD Finalizes CMMC 2.0 Rule",
  "url": "https://example-industry-news.com/cmmc-final-rule",
  "content": "Full article text goes here...",
  "usable": true
}
```

## Example failed result

```json
{ "title": "", "url": "", "content": "", "usable": false }
```

## Dependencies

- The n8n HTML node upstream must be configured with the selectors documented in `editorial-config.json` (defaults: `title: h1`, `content: .td-post-content`).

## Security considerations

- Always strips `<script>`/`<style>` before any other processing — this is the sanitization boundary that makes it safe to later embed `content` inside an LLM prompt string.
- Does not follow links or fetch additional resources — operates only on data already provided to it.

## Testing requirements

- Unit tests (`tests/source-extractor.test.js`): title/URL/content normalization, script/style stripping, entity decoding, unusable-on-empty-title, unusable-on-short-content, unusable-on-fully-empty-input, custom `minContentLength` threshold.
