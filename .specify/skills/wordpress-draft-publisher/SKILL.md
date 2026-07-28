---
name: wordpress-draft-publisher
description: Use only after cmmc-oat-validator returns passed:true, to build the WordPress REST payload and create the post as a draft (or, in dry-run mode, report what would have been created without calling WordPress). Do not use this skill for any article that has not passed OAT — it has no knowledge of validation state and will happily construct a payload from whatever it's given, so the caller (n8n-workflow-assembler's pass/fail branch) must be the actual gate.
version: 1.0.0
inputs:
  - name: article
    type: Article
  - name: html
    type: string
    description: Rendered HTML body from article-blocks-to-html.
  - name: config
    type: object
    description: "{ baseUrl, categoryId, defaultStatus, author } — WordPress defaults, from provider-config.json / editorial-config.json. No credential values, no hardcoded staging URL."
  - name: dryRun
    type: boolean
  - name: credentialRef
    type: string
    description: Non-secret n8n credential reference for HTTP Basic Auth (application password). Never the credential value itself.
  - name: transport
    type: function
    description: Injected async (callConfig, payload) => rawWordPressResponse — the n8n HTTP Request node in production, a mock in tests.
  - name: sourceUrl
    type: string
    description: Optional, carried into the resulting PublicationRecord.
  - name: groupId
    type: string
    description: Optional, carried into the resulting PublicationRecord for multi-perspective articles.
outputs:
  - name: result
    type: object
    description: "In dry-run mode: { dryRun: true, wouldPublish: payload }. Otherwise: a normalized PublicationRecord (see data-model.md#publicationrecord)."
dependencies:
  - cmmc-oat-validator (must have already returned passed:true for this article)
  - article-blocks-to-html (produces the html input)
  - n8n credential store (WordPress application password / basic auth)
---

## Purpose

Turn a validated article into exactly one WordPress draft post — always a draft, always using configured (not hardcoded) category/base URL, and never touching the network in dry-run mode.

## When to use

- Once per article that has passed `cmmc-oat-validator`.
- In dry-run mode, to preview exactly what would be published without any external side effect.

## When not to use

- Never call this skill for an article that has not passed OAT — enforcing that is `n8n-workflow-assembler`'s job (the explicit pass/fail branch), not this skill's. This skill trusts its caller on that point.
- Do not use this skill to update any duplicate-detection or memory cache — that is `publication-memory-updater`'s job, run strictly after this skill returns a successful `PublicationRecord`.

## Required inputs

`article`, `html`, and `config.categoryId` are required for building the payload; `credentialRef` and `transport` are required unless `dryRun` is true.

## Output contract

Dry-run: `{ dryRun: true, wouldPublish: <payload> }` — no network call, no `PublicationRecord`. Live: a `PublicationRecord` — `{ postId, status: 'draft', categoryId, subtitleWritten, publishedAt, sourceUrl, groupId }`.

## Processing rules

1. Build the payload: `title` from `article.headline`, `content` from `html`, `slug` from `article.slug`, `status` **always** `'draft'`, `categories: [config.categoryId]`, `featured_media` when supplied else `null`, and `meta.td_post_theme_settings.td_subtitle` from `article.subtitle` (falling back to `article.dek` only if `subtitle` is somehow empty at this point — defensive, since OAT should already guarantee it's present).
2. In dry-run mode, return immediately with the constructed payload — no HTTP call config is even built.
3. Otherwise, build a credential-free HTTP call configuration (`POST {config.baseUrl}/wp-json/wp/v2/posts`) carrying only `credentialRef` (a pointer), invoke the injected `transport`, and normalize the raw response into a `PublicationRecord`.

## Validation rules

- `status` in the payload MUST always be `'draft'` — there is no code path in this skill that produces any other value.
- `config.baseUrl` and `config.categoryId` MUST come from configuration, never be hardcoded (resolves the source workflow's hardcoded staging domain).
- The payload MUST NOT contain a credential value anywhere.

## Failure conditions

| Condition | Result |
|---|---|
| `article.headline` missing | Throws |
| `html` missing/empty | Throws |
| `config.categoryId` missing | Throws |
| `config.baseUrl` or `credentialRef` missing (live mode) | Throws |
| WordPress response missing `id` | Throws `malformed WordPress response (missing id)` |

## Example invocation

```js
const { publishDraft } = require('./scripts/wordpress-publisher');

const result = await publishDraft({
  article, html,
  config: { baseUrl: process.env.WORDPRESS_BASE_URL, categoryId: process.env.WORDPRESS_CATEGORY_ID },
  dryRun: false,
  credentialRef: 'wordpressBasicAuthCredential',
  sourceUrl: sourceArticle.url,
  transport: (callConfig, payload) => n8nHttpRequestNode.send(callConfig, payload)
});
```

## Example successful result

```json
{ "postId": 4821, "status": "draft", "categoryId": 52, "subtitleWritten": "...", "publishedAt": "2026-07-28T00:00:00.000Z", "sourceUrl": "https://...", "groupId": null }
```

## Example failed result

```
Error: wordpress-draft-publisher: malformed WordPress response (missing id)
```

## Dependencies

- `cmmc-oat-validator` (gating, enforced by the caller).
- `article-blocks-to-html` for `html`.
- An n8n credential holding the WordPress application password.

## Security considerations

- Never handles the WordPress password/application-password value directly — only a credential reference, resolved by the n8n HTTP Request node's own credential store.
- Always drafts, never publishes directly — a hard invariant, not a configurable one, so a bug elsewhere cannot accidentally make content public.

## Testing requirements

- Unit tests (`tests/wordpress-publisher.test.js`): always-draft status, configured category (not hardcoded), subtitle-over-dek preference with dek fallback, required-field fail-fast, credential-free call config, dry-run no-network-call behavior, successful `PublicationRecord` normalization, malformed-response rejection.
