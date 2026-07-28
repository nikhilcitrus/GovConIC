# Data Model: CMMC Content Publishing Workflow

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

This document defines the canonical shape of every entity that flows between skills. Skills communicate only through these shapes — never through implicit upstream node lookups (resolves [R15](./research.md#r15-fragile-node-name-lookups-couple-stages-together)). Authoritative JSON Schemas live under each skill's `schemas/` directory and under `contracts/`; this file is the human-readable reference they must match.

---

## WorkflowContext

Produced by `workflow-context-manager`. Normalized view of memory + run configuration handed to every downstream skill.

| Field | Type | Notes |
|---|---|---|
| `runId` | string | Unique per workflow execution |
| `generationMode` | enum: `standard` \| `multiPerspective` | Determined during selection |
| `selectedFormat` | string | One of the configured formats |
| `selectedLeadAngle` | string | One of the configured lead angles |
| `recentHeadlines` | string[] | Bounded by `recentHeadlines` cache limit |
| `avoidedTopics` | string[] | Baseline + pending follow-on topics |
| `normalizedSourceArticle` | `SourceArticle` \| `null` | `null` when no source-based generation is used |
| `dryRun` | boolean | Propagated to publication and memory-update skills |
| `seed` | string \| null | When present, selection MUST be deterministic (FR-006) |

## SourceArticle

Produced by `source-content-extractor`.

| Field | Type | Notes |
|---|---|---|
| `title` | string | May be empty only if `usable: false` |
| `url` | string | Preserved for attribution and duplicate-by-URL checks |
| `content` | string | Sanitized HTML-stripped text, never raw unsanitized HTML |
| `usable` | boolean | `false` when extraction failed or produced empty content — FR-010 gate |

## GenerationRequest

Produced by `topic-angle-selector` (standard mode: 1 request) or `multi-perspective-planner` (multi-perspective mode: exactly 3 requests). Consumed by `cmmc-editorial-prompt-builder`.

| Field | Type | Notes |
|---|---|---|
| `topic` | string | Narrow CMMC topic/angle |
| `format` | string | Selected format description |
| `leadAngle` | string | `Unobvious` \| `Under the Radar` \| `Innovative` |
| `avoidTopics` | string[] | From `WorkflowContext.avoidedTopics` |
| `recentHeadlines` | string[] | From `WorkflowContext.recentHeadlines` |
| `perspective` | enum: `Executive` \| `Engineering` \| `Compliance` \| `null` | `null` in standard mode |
| `perspectiveInstructions` | string \| null | Set only when `perspective` is set |
| `groupId` | string \| null | Shared across the 3 requests in multi-perspective mode; `null` in standard mode |
| `sourceReference` | `SourceArticle` \| null | Required (and `usable: true`) when `perspective` is set |

**Invariant**: In multi-perspective mode, exactly 3 `GenerationRequest` objects are produced per run, all sharing one `groupId`, one per `perspective` value, resolving [R14](./research.md#r14-multi-perspective-batch-loop-never-iterates-past-the-first-item).

## ContentBlock

One element of `Article.body`. Discriminated union on `type`.

| `type` | Required fields | HTML mapping |
|---|---|---|
| `p` | `text` | `<p>{text}</p>` |
| `h2` | `text` | `<h2>{text}</h2>` |
| `h3` | `text` | `<h3>{text}</h3>` |
| `h4` | `text` | `<h4>{text}</h4>` |
| `stat` | `value`, `label` | Semantic stat markup (see `article-blocks-to-html` schema) |
| `pullquote` | `text` | `<blockquote>{text}</blockquote>` |
| `list` | `items: string[]` | `<ul><li>...</li></ul>` |
| `callout` | `text` | `<div class="callout">{text}</div>` |

Any `type` outside this table is rejected by default (resolves [R12](./research.md#r12-arbitrary-unknown-block-type-fallback-produces-guessed-html)).

## Article

Canonical article object — the output of `article-response-normalizer`, the input to `article-blocks-to-html` and `cmmc-oat-validator`.

```json
{
  "headline": "string",
  "slug": "string",
  "section": "string",
  "kicker": "string",
  "subtitle": "string",
  "dek": "string",
  "byline": "string",
  "date": "YYYY-MM-DD",
  "readMinutes": 1,
  "bodyWordCount": 0,
  "body": [],
  "altTitles": [],
  "linkedinPost": "string",
  "newsletterSummary": "string",
  "suggestedDiagrams": [],
  "followOnIdeas": []
}
```

- `subtitle` is independently required — never backfilled from `dek` or `kicker` (resolves [R3](./research.md#r3-subtitle-required-by-prose-absent-from-the-json-schema-shown-to-the-llm), [R4](./research.md#r4-parser-drops-subtitle-even-when-present)).
- `bodyWordCount` is the normalizer's own calculated paragraph-only word count, not a value trusted from the LLM (resolves [R7](./research.md#r7-parser-calculates-a-word-count-but-never-returns-or-validates-it)).
- `body` is `ContentBlock[]`, order-preserving.
- The full JSON Schema lives at `.specify/skills/article-response-normalizer/schemas/article.schema.json` (created in Phase 5) and at `contracts/article.schema.json` (this feature's contract copy).

## ValidationResult (OAT Result)

Produced by `cmmc-oat-validator`. Consumed by the workflow's pass/fail branch.

| Field | Type | Notes |
|---|---|---|
| `passed` | boolean | |
| `errors` | `{code, message, field?}[]` | Non-empty when `passed: false` |
| `warnings` | `{code, message, field?}[]` | E.g., unverifiable-citation flags; does not block passage |
| `metrics` | object | `{ paragraphWordCount, paragraphCount, h2Count, statCount, pullquoteCount, calloutCount, duplicateCheck: {...} }` |
| `normalizedArticle` | `Article` | Present regardless of pass/fail, for diagnostics |

**Invariant**: An object shaped as a failed `ValidationResult` (`passed: false`, or carrying a `debug_failure`-equivalent marker) is never structurally acceptable input to `wordpress-draft-publisher` (resolves [R8](./research.md#r8-diagnosticdebug-objects-can-reach-the-wordpress-publish-node)). The assembler enforces this by routing only `passed: true` results forward.

## PublicationRecord

Produced by `wordpress-draft-publisher` on confirmed success.

| Field | Type | Notes |
|---|---|---|
| `postId` | number | WordPress post ID |
| `status` | `"draft"` | Always `draft` unless dry-run (in which case no record is created at all) |
| `categoryId` | number | From configuration |
| `subtitleWritten` | string | The value written to `td_post_theme_settings.td_subtitle` |
| `publishedAt` | ISO timestamp | |
| `sourceUrl` | string \| null | From `SourceArticle.url` when applicable |
| `groupId` | string \| null | Present for multi-perspective articles |

## WorkflowMemory

Persistent state, read by `workflow-context-manager`, written only by `publication-memory-updater` after a confirmed `PublicationRecord` (resolves [R9](./research.md#r9-duplicate-detection-caches-update-before-wordpress-confirms-success)).

| Field | Type | Cache limit (default) |
|---|---|---|
| `recentHeadlines` | string[] | 15 |
| `pendingFollowOnTopics` | string[] | 30 |
| `postedUrls` | string[] | 300 |
| `postedTitles` | string[] | 300 |
| `postedContentHashes` | string[] | 300 |
| `formatRotationIndex` | number | n/a (cyclic) |
| `leadAngleRotationIndex` | number | n/a (cyclic) |
| `oatPassedCount` | number | n/a (monotonic counter) |
| `lastPublicationTimestamp` | ISO timestamp \| null | n/a |

Storage is behind a swappable adapter (n8n workflow static data initially; see `publication-memory-updater/SKILL.md` for the adapter contract) — no skill other than `workflow-context-manager` and `publication-memory-updater` may read/write it directly.

## ProviderConfig

Non-secret configuration for the LLM call, read by `llm-content-generator`. **Never contains credential values** — those come from n8n credentials / environment variables only (resolves [R10](./research.md#r10-embedded-groq-api-key)).

| Field | Type | Notes |
|---|---|---|
| `provider` | string | e.g. `groq` |
| `baseUrl` | string | OpenAI-compatible endpoint |
| `model` | string | From environment/config, not hardcoded |
| `temperature` | number | |
| `maxTokens` | number | |
| `timeoutMs` | number | |
| `retryCount` | number | Applied only to transient failures |
| `retryDelayMs` | number | |

---

## Entity relationship summary

```
WorkflowContext ──> GenerationRequest(s) ──> (LLM call) ──> raw response
raw response ──> Article (via article-response-normalizer)
Article ──> ContentBlock[] ──> HTML + plain text (via article-blocks-to-html)
Article + HTML ──> ValidationResult (via cmmc-oat-validator)
ValidationResult (passed=true) ──> PublicationRecord (via wordpress-draft-publisher)
PublicationRecord ──> WorkflowMemory update (via publication-memory-updater)
Every stage ──> structured log event (via workflow-observability-reporter)
```
