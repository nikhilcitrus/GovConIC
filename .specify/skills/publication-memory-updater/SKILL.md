---
name: publication-memory-updater
description: Use only after wordpress-draft-publisher returns a confirmed, non-dry-run PublicationRecord (with a real postId) to append recent headlines, follow-on topics, posted URLs/titles/content hashes, and the OAT-passed counter. Do not call this skill before publication is confirmed — resolves research.md R9, where the source workflow updated its duplicate caches inside the OAT step itself, before WordPress had even been called.
version: 1.0.0
inputs:
  - name: memory
    type: WorkflowMemory
    description: Prior memory state (from workflow-context-manager's read, or this skill's own prior output).
  - name: article
    type: Article
    description: The just-published Article — headline, body (for content hash), followOnIdeas.
  - name: publicationRecord
    type: PublicationRecord
    description: MUST be a confirmed record with a postId — never a dry-run result, never a failed/absent publish.
  - name: cacheLimits
    type: object
    description: "{ recentHeadlines=15, pendingFollowOnTopics=30, duplicateHistory=300 } — from validation-config.json."
outputs:
  - name: updatedMemory
    type: WorkflowMemory
    description: The new memory state; the caller persists it via the configured storage adapter.
dependencies:
  - wordpress-draft-publisher (must have returned a confirmed, non-dry-run PublicationRecord)
---

## Purpose

Be the *only* place `WorkflowMemory`'s duplicate-detection and headline-history fields are ever written, and guarantee that writing only ever happens after a real, confirmed WordPress draft exists.

## When to use

- Immediately after `wordpress-draft-publisher` returns a `PublicationRecord` with a real `postId` (i.e., `dryRun` was `false` and the WordPress call succeeded).

## When not to use

- Never call this skill for a dry-run result (`{ dryRun: true, wouldPublish }`) — there is no `postId` to confirm, and calling it anyway would throw.
- Never call this skill from inside `cmmc-oat-validator` or before the WordPress call — that ordering is exactly the defect this skill's existence corrects (research.md R9).
- Do not use this skill to decide *whether* to publish — that decision already happened upstream; this skill only records the aftermath of a successful one.

## Required inputs

`article.headline` and a `publicationRecord` with a defined `postId` are both required — their absence throws, since this skill has no meaningful "partial" update.

## Output contract

An updated `WorkflowMemory` object. This is a **pure transform** — it performs no I/O itself. The caller is responsible for persisting `updatedMemory` via whichever storage adapter is configured (see Dependencies).

## Processing rules

1. Append `article.headline` to `recentHeadlines` and `postedTitles` (deduplicated, trimmed to `cacheLimits.recentHeadlines` / `cacheLimits.duplicateHistory` respectively).
2. Compute a normalized-content hash from the article's paragraph/heading/etc. text and append it to `postedContentHashes` (deduplicated, trimmed).
3. If `publicationRecord.sourceUrl` is present, append it to `postedUrls` (deduplicated, trimmed); otherwise `postedUrls` is left unchanged.
4. Append each of `article.followOnIdeas` to `pendingFollowOnTopics` (deduplicated per-item, trimmed to `cacheLimits.pendingFollowOnTopics`).
5. Increment `oatPassedCount` by 1 and set `lastPublicationTimestamp` to `publicationRecord.publishedAt`.

## Validation rules

- `publicationRecord.postId` MUST be defined — this is the skill's proxy for "publication genuinely succeeded."
- Every appended cache MUST be deduplicated before trimming — re-running this skill idempotently with the same article never grows a cache with a repeated entry.

## Failure conditions

| Condition | Result |
|---|---|
| `article.headline` missing | Throws |
| `publicationRecord` missing or has no `postId` | Throws — this is the primary safeguard against premature cache updates |

## Example invocation

```js
const { updateMemoryAfterPublish } = require('./scripts/memory-updater');

const updatedMemory = updateMemoryAfterPublish({
  memory: priorMemory,
  article,
  publicationRecord, // from wordpress-draft-publisher, confirmed (postId present)
  cacheLimits: { recentHeadlines: 15, pendingFollowOnTopics: 30, duplicateHistory: 300 }
});
// caller persists updatedMemory via the configured storage adapter
```

## Example successful result

```json
{
  "recentHeadlines": ["...", "A Brand New Headline"],
  "postedTitles": ["...", "A Brand New Headline"],
  "postedUrls": ["...", "https://source.example.com/x"],
  "postedContentHashes": ["...", "a1b2c3"],
  "pendingFollowOnTopics": ["...", "Follow-on idea A", "Follow-on idea B"],
  "oatPassedCount": 42,
  "lastPublicationTimestamp": "2026-07-28T00:00:00.000Z"
}
```

## Example failed result

```
Error: publication-memory-updater: a confirmed publicationRecord (with postId) is required
```

## Dependencies

- `wordpress-draft-publisher`'s confirmed `PublicationRecord`.
- A storage adapter for persistence. This iteration's default adapter is n8n workflow static data (`$getWorkflowStaticData('global')`) — read before this skill runs, written with this skill's returned `updatedMemory` immediately after. `createInMemoryAdapter` in `scripts/memory-updater.js` documents the `{ read, write }` interface a future database-backed adapter must implement to be a drop-in replacement.

## Security considerations

- Handles only editorial metadata (headlines, URLs, content hashes, follow-on topic strings) — no credentials.
- Content hashing uses a simple non-cryptographic hash (collision-tolerant for this use case — a false "duplicate" skip is a minor inconvenience, not a security issue); it is not intended as a security control.

## Testing requirements

- Unit tests (`tests/memory-updater.test.js`): correct field-by-field append behavior, follow-on topic deduplication, counter increment and timestamp update, idempotent re-run producing no duplicate entries, cache-limit enforcement and trim-from-the-front behavior, no `postedUrls` update when no source URL, fail-fast on an unconfirmed/missing `publicationRecord`, the generic dedup/trim helper, and the swappable storage-adapter interface via the in-memory reference adapter.
