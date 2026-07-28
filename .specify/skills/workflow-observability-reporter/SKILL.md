---
name: workflow-observability-reporter
description: Use at every stage transition (selection, generation, normalization, OAT, publication, memory update) to emit a structured, secret-scrubbed log event. Do not use this skill to make pass/fail decisions — it only reports decisions already made elsewhere.
version: 1.0.0
inputs:
  - name: runId
    type: string
  - name: articleId
    type: string
  - name: groupId
    type: string
    description: Present for multi-perspective articles.
  - name: stage
    type: string
  - name: status
    type: string
    description: "One of: selected, generated, normalization_failed, oat_failed, publication_failed, published, memory_updated, skipped_duplicate, dry_run_complete."
  - name: durationMs
    type: number
  - name: retryCount
    type: number
  - name: failureCode
    type: string
  - name: message
    type: string
    description: Always scrubbed of secret-shaped substrings regardless of includeSensitiveContent; truncated to 300 characters unless includeSensitiveContent is explicitly true.
  - name: includeSensitiveContent
    type: boolean
    description: Optional, default false. Even when true, secret patterns (API keys, Authorization headers, password/api_key key-value pairs) are still redacted unconditionally.
outputs:
  - name: logEvent
    type: object
    description: "{ runId, articleId, groupId, stage, status, durationMs, retryCount, failureCode, message, timestamp }."
dependencies: []
---

## Purpose

Give every stage of the pipeline one safe, structured way to say what happened — without any stage needing its own ad hoc logging, and without any stage risking a credential or full prompt leaking into logs.

## When to use

- At every meaningful stage transition: topic/format selected, article generated, normalization failed, OAT failed, publication failed, published, memory updated, skipped as duplicate, or dry-run completed.

## When not to use

- Do not use this skill to decide whether something passed or failed — it only records a decision `cmmc-oat-validator`, `wordpress-draft-publisher`, etc. already made.
- Do not bypass this skill's scrubbing by logging raw request/response objects directly elsewhere — always route through `createLogEvent`.

## Required inputs

`runId`, `stage`, and `status` are required; `status` must be one of the 9 defined values (fail-fast on typos — a stage that logs a status string not in the required list is treated as a configuration bug, not silently accepted).

## Output contract

A structured event object — see frontmatter `outputs`. `message` is always scrubbed of secret-shaped substrings (Groq-style `gsk_...` keys, `Bearer ...` headers, `password`/`api_key`/`authorization` key-value pairs) regardless of any other setting, and is truncated to 300 characters unless `includeSensitiveContent: true` is explicitly passed (still scrubbed even then).

## Processing rules

1. Validate `status` against the fixed list of 9 required statuses.
2. Scrub `message` for secret-shaped substrings unconditionally.
3. Truncate `message` to 300 characters unless `includeSensitiveContent` is explicitly `true`.
4. Stamp the event with an ISO `timestamp`.

## Validation rules

- `status` MUST be one of the 9 required values — no ad hoc status strings.
- `message` MUST NEVER contain a raw credential, password, or full Authorization header value after this skill processes it.

## Failure conditions

| Condition | Result |
|---|---|
| `runId` missing | Throws |
| `stage` missing | Throws |
| `status` not in the required list | Throws |

## Example invocation

```js
const { createLogEvent } = require('./scripts/reporter');

const event = createLogEvent({
  runId, articleId, stage: 'oat-validation', status: 'oat_failed',
  durationMs: 45, retryCount: 0, failureCode: 'wrong_paragraph_count',
  message: 'Expected exactly 4 "p" blocks, found 3'
});
```

## Example successful result

```json
{ "runId": "run-1", "articleId": "article-1", "groupId": null, "stage": "publication", "status": "published", "durationMs": 812, "retryCount": 0, "failureCode": null, "message": "WordPress draft 4821 created", "timestamp": "2026-07-28T00:00:00.000Z" }
```

## Example failed result

```
Error: workflow-observability-reporter: unknown status "success" (must be one of selected, generated, normalization_failed, oat_failed, publication_failed, published, memory_updated, skipped_duplicate, dry_run_complete)
```

## Dependencies

- None — this skill is a pure, self-contained utility consumed by every other stage.

## Security considerations

- Unconditional secret scrubbing is the core guarantee of this skill — every other skill's log calls rely on it rather than re-implementing redaction themselves.
- Full prompt/source content is never logged by default (`includeSensitiveContent` defaults to `false`), per FR-043.

## Testing requirements

- Unit tests (`tests/reporter.test.js`): all 9 statuses accepted, unknown status rejected, required-field fail-fast, full field pass-through, Groq-key scrubbing, password/api_key/authorization key-value scrubbing, default 300-character truncation, ISO timestamp presence.
