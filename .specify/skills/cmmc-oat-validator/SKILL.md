---
name: cmmc-oat-validator
description: Use as the final quality gate before publication — validates a normalized, HTML-converted article against structure, word/block counts, subtitle rules, CMMC relevance, duplicates, prohibited language, companion assets, and attribution/evidence concerns. Do not use this skill to normalize LLM output (article-response-normalizer's job) or to render HTML (article-blocks-to-html's job) — it consumes both of their outputs. Never let anything but this skill's passed:true result reach wordpress-draft-publisher.
version: 1.0.0
inputs:
  - name: article
    type: Article
    description: The normalized article from article-response-normalizer.
  - name: sourceUrl
    type: string
    description: Optional — the source article's URL, for duplicate-by-URL detection.
  - name: topicContext
    type: string
    description: Optional — the selected topic string, included in the CMMC-relevance search text.
  - name: memory
    type: object
    description: "{ postedUrls, postedTitles, postedContentHashes, recentHeadlines } — READ ONLY. This skill never writes to memory; publication-memory-updater does, and only after confirmed publish."
  - name: config
    type: object
    description: validation-config.json contents — word/block-count rule, subtitle limits, CMMC terms, prohibited patterns, companion-asset minimums.
outputs:
  - name: ValidationResult
    type: object
    description: "{ passed, errors, warnings, metrics, normalizedArticle } — see data-model.md#validationresult-oat-result and schemas/oat-result.schema.json."
dependencies:
  - article-response-normalizer (produces the article input)
  - article-blocks-to-html (its word-count outputs may cross-check this skill's own calculations)
  - validation-config.json
---

## Purpose

Be the single, authoritative, zero-hidden-tolerance acceptance gate — resolving research.md's R1, R2, R5, R6, R7, R9, R12 all at the point where they'd otherwise cause silent publication of non-compliant content.

## When to use

- Once per generated article, after `article-blocks-to-html` has produced HTML/plain-text/word counts, immediately before the pass/fail branch that decides whether `wordpress-draft-publisher` ever runs.

## When not to use

- Do not use this skill to write to any duplicate-detection or headline cache — it only ever reads `memory` (verified by a dedicated unit test that the memory object is untouched after validation). Writing happens only in `publication-memory-updater`, only after confirmed publish (resolves research.md R9).
- Do not use this skill's output directly as a WordPress payload — a failed `ValidationResult` must never be structurally mistaken for a publishable article (resolves research.md R8; enforced by `n8n-workflow-assembler`'s explicit pass/fail branch).

## Required inputs

`article` and `config` are required. `sourceUrl`, `topicContext`, and `memory` are optional but should always be supplied in production (an empty `memory` object is valid for a first-ever run).

## Output contract

`{ passed, errors, warnings, metrics, normalizedArticle }`. `passed` is `true` only when `errors` is empty — `warnings` (attribution/evidence flags) never affect `passed`. `metrics` includes calculated block counts and the matched CMMC terms, useful for `workflow-observability-reporter`.

## Processing rules (by category)

1. **Identity & structure**: headline ≥ 5 chars, URL-safe slug, all required top-level fields present, every body block has the fields its type requires.
2. **Word/block counts**: exact block-type counts from `config` (default 4 `p`, 2 `h2`, 1 `stat`, 1 `pullquote`, 1 `callout`; `list` optional); each paragraph 20-50 words; total paragraph-only words within `config.totalWordMin`-`config.totalWordMax`, widened only by an explicit `config.wordCountTolerance` (default `0` — resolves R6); `article.bodyWordCount` must equal the validator's own recomputed total (resolves R7).
3. **Subtitle**: mandatory, `config.subtitleWordMin`-`config.subtitleWordMax` words, distinct from both `dek` and `kicker`.
4. **CMMC relevance**: at least one `config.cmmcTerms` entry must appear as a **whole term** (word-boundary matched, so `"assessment"` never matches inside `"reassessment"`, and `"Level 1"` never matches inside `"Level 10"`) in headline, subtitle, dek, body text, or topic context.
5. **Duplicate detection** (read-only): checks, in order, source-URL match, exact normalized-headline match, six-consecutive-word headline overlap against posted titles, normalized-content-hash match, and six-word overlap against recent headlines — returning the **specific** reason for the first match found.
6. **Prohibited patterns**: case-insensitive substring match against `config.prohibitedPatterns` across headline/dek/subtitle/body text.
7. **Companion assets**: alt titles, LinkedIn post length, newsletter summary length, diagram count, follow-on idea count against `config.companionAssets` minimums.
8. **Attribution & evidence** (warnings only, never block `passed`): flags a quote immediately attributed to a capitalized two-word name as a possible fabrication needing verification; flags a numeric claim (`$X`, `X%`, `Xx`) with no nearby attribution marker (`per`, `according to`, `source:`, `report`, `advisory`, `study`) within ~60 characters; flags `"according to ..."`-style citation phrases for human review. These never represent generated facts as verified — they surface uncertainty rather than resolve it.

## Validation rules

- Every hard-fail category above contributes to `errors`; only `errors.length === 0` yields `passed: true`.
- `warnings` are always attribution/evidence-only — no other category ever emits a warning instead of an error.
- Duplicate checks MUST NOT mutate `memory` — verified by a dedicated test that snapshots `memory` before and after.

## Failure conditions

See the processing-rules table above; each category produces a distinct `error.code` (e.g. `wrong_paragraph_count`, `paragraph_word_count_out_of_range`, `total_word_count_out_of_range`, `body_word_count_mismatch`, `missing_subtitle`, `subtitle_matches_dek`, `not_cmmc_relevant`, `duplicate_source_url`, `duplicate_exact_headline`, `duplicate_headline_overlap`, `duplicate_content_hash`, `duplicate_recent_headline_similarity`, `prohibited_pattern`, `insufficient_alt_titles`, `linkedin_post_too_short`, etc.) so `workflow-observability-reporter` can log a specific, actionable failure reason.

## Example invocation

```js
const { validateArticle } = require('./scripts/oat-validator');
const result = validateArticle({ article, sourceUrl, topicContext: 'SPRS score submission accuracy', memory, config: validationConfig });
```

## Example successful result

```json
{ "passed": true, "errors": [], "warnings": [], "metrics": { "paragraphCount": 4, "h2Count": 2, "paragraphWordCount": 142, "matchedCmmcTerms": ["CMMC", "assessment"] }, "normalizedArticle": { "...": "..." } }
```

## Example failed result

```json
{
  "passed": false,
  "errors": [
    { "code": "missing_subtitle", "message": "subtitle is mandatory", "field": "subtitle" },
    { "code": "duplicate_headline_overlap", "message": "Headline overlaps 6+ consecutive words with a previously posted title: \"...\"" }
  ],
  "warnings": [],
  "metrics": { "...": "..." },
  "normalizedArticle": { "...": "..." }
}
```

## Dependencies

- `article-response-normalizer`, `article-blocks-to-html` for inputs.
- `validation-config.json` for every threshold — no rule is embedded directly in this skill's code as a magic number without a corresponding config default.

## Security considerations

- Handles article content and metadata only — no credentials pass through this skill.
- Attribution/evidence heuristics are pattern-based, not a factual-accuracy guarantee — they reduce risk, they do not eliminate it; treat `warnings` as "needs human review," never as "verified false" or "verified true."

## Testing requirements

- Unit tests (`tests/oat-validator.test.js`, 25 cases): full-pass baseline, each identity/structure failure, exact block-count enforcement, zero-tolerance paragraph and total word-count enforcement, `bodyWordCount` equality check, subtitle mandatoriness/length/distinctness, CMMC whole-term matching (including the "assessment"-inside-"reassessment" and "Level 1"-inside-"Level 10" false-positive-prevention cases), all five duplicate-detection categories plus a read-only-memory guarantee, prohibited-pattern rejection, companion-asset minimums, attribution/evidence warnings (fabricated-quote and unattributed-numeric-claim), and confirmation that warnings never flip `passed`.
