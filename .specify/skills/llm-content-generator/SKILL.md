---
name: llm-content-generator
description: Use to call the configured LLM provider (Groq initially, OpenAI-compatible) with the request built by cmmc-editorial-prompt-builder, retrying only transient failures. Do not use this skill to parse or validate the article content inside the response (article-response-normalizer's job) — it only unwraps the provider envelope.
version: 1.0.0
inputs:
  - name: request
    type: object
    description: The provider-neutral request from cmmc-editorial-prompt-builder, matching contracts/llm-request.schema.json.
  - name: providerConfig
    type: object
    description: "{ provider, baseUrl, model, timeoutMs, retryCount, retryDelayMs } — read from provider-config.json. No credential values."
  - name: credentialRef
    type: string
    description: A non-secret reference to the n8n credential (or environment variable name) holding the actual API key. Never the key value itself.
outputs:
  - name: content
    type: string
    description: The raw string from choices[0].message.content — still JSON-encoded text, not yet parsed/validated (article-response-normalizer does that).
  - name: usage
    type: object
    description: Token usage metadata, when the provider returns it.
  - name: attempts
    type: number
    description: How many attempts were made before success (1 when the first attempt succeeded).
dependencies:
  - cmmc-editorial-prompt-builder (produces the request input)
  - n8n credential store or environment variable (Groq API key — never a source-controlled value)
---

## Purpose

Call the configured LLM provider safely: bounded timeout, retries only for genuinely transient failures (never for a malformed request or an auth failure), and credentials that never appear in this skill's inputs, outputs, or logs.

## When to use

- Once per `GenerationRequest` after `cmmc-editorial-prompt-builder` has produced the request object.

## When not to use

- Do not use this skill to parse the article JSON embedded in the response — pass `content` straight to `article-response-normalizer`.
- Do not use this skill's retry loop for non-network failures (e.g. a 400 Bad Request from a malformed prompt) — those are not transient and must surface immediately.

## Required inputs

`request`, `providerConfig.baseUrl`, and `credentialRef` are all required. The actual transport call (`transport` in `callWithRetry`) is injected by the caller (the n8n HTTP Request node in production, a mock function in tests) — this skill's logic is transport-agnostic by design.

## Output contract

`{ content, usage, model, attempts }` — see frontmatter `outputs`. `content` is still a raw string; parsing/validation happens downstream in `article-response-normalizer`.

## Processing rules

1. `buildHttpCallConfig` produces a non-secret call configuration: method, URL, `Content-Type`/`rawContentType` both set consistently to `application/json` (resolves research.md R16), timeout, and retry settings — plus `credentialRef` (a pointer, never a value).
2. `callWithRetry` invokes the injected transport up to `retryCount` times, waiting `retryDelayMs` between attempts, but **only** when `isTransientError` returns true for the failure (network errors, HTTP 408/425/429/500/502/503/504). Any other failure is thrown immediately on the first attempt.
3. `parseProviderResponse` validates the OpenAI-compatible envelope shape (`choices[0].message.content` must exist) and throws a clear error otherwise — this is a `normalization_failed`-adjacent condition, not a retryable one.
4. `redactForLogging` must be used for any log/observability output involving this skill's request or response — it strips `Authorization` headers, `credentialRef`, and full message content.

## Validation rules

- `providerConfig.baseUrl` MUST be present.
- `credentialRef` MUST be present and MUST NOT itself look like a credential value (it is a name/id, not a secret).
- Retries apply only to transient failures — a fixed, explicit list, not "anything that throws."

## Failure conditions

| Condition | Result |
|---|---|
| `providerConfig.baseUrl` missing | Throws |
| `credentialRef` missing | Throws |
| Transport throws a non-transient error | Thrown immediately, no retry |
| Transport throws a transient error `retryCount` times in a row | Thrown after the last attempt |
| Provider returns a malformed envelope (no `choices`) | Throws `malformed provider response envelope` |

## Example invocation

```js
const { buildHttpCallConfig, callWithRetry } = require('./scripts/llm-client');

const callConfig = buildHttpCallConfig(
  { baseUrl: 'https://api.groq.com/openai/v1/chat/completions', timeoutMs: 30000, retryCount: 3, retryDelayMs: 5000 },
  'groqApiCredential' // n8n credential name, not the key itself
);

const result = await callWithRetry(
  (req) => n8nHttpRequestNode.send(callConfig, req), // injected transport
  request,
  { retryCount: 3, retryDelayMs: 5000 }
);
```

## Example successful result

```json
{ "content": "{\"headline\": \"...\", \"...\": \"...\"}", "usage": { "total_tokens": 1180 }, "model": "llama-3.3-70b-versatile", "attempts": 1 }
```

## Example failed result

```
Error: llm-content-generator: malformed provider response envelope (missing choices[])
```

## Dependencies

- `cmmc-editorial-prompt-builder` for the request.
- An n8n credential (or environment variable) holding the actual Groq API key — see `.specify/integrations/groq/`.

## Security considerations

- The exposed Groq key found in the source workflow (`gsk_A7yZ...`) is never referenced or reproduced anywhere in this skill's code, docs, or tests — see `checklists/cmmc-workflow-security.md`.
- `redactForLogging` must be applied before any request/response reaches `workflow-observability-reporter`.
- `callWithRetry`'s injected transport is responsible for actually attaching the credential (via the n8n credential store) — this skill's own code never handles the raw key value.

## Testing requirements

- Unit tests (`tests/llm-client.test.js`): transient-vs-non-transient classification, credential-free call config, envelope parsing (success and malformed), redaction correctness, retry-then-succeed, no-retry-on-non-transient, retry-exhaustion.
