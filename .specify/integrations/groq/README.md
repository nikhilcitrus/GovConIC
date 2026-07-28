# Groq Integration

**Used by**: `.specify/skills/llm-content-generator/`

## Purpose

Generate structured CMMC article JSON via Groq's OpenAI-compatible Chat Completions API. This is the initial and only wired LLM provider; `llm-content-generator` is written against a provider-neutral request/response shape so another OpenAI-compatible provider could be substituted without changing `cmmc-editorial-prompt-builder` or any skill downstream of the raw response.

## Authentication

HTTP Bearer token in the `Authorization` header. **Never** embedded in workflow JSON, skill docs, examples, test fixtures, or logs — see `checklists/cmmc-workflow-security.md`. The source workflow this feature replaces had a live key hardcoded in `n8n/cmmc prompt development.json`; that key is treated as compromised and must be revoked.

## Environment variables

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | The API key value. Stored **only** in the n8n credential store or the runtime environment — never in `.env` committed to git, never in `.env.example`. |
| `GROQ_BASE_URL` | Defaults to `https://api.groq.com/openai/v1/chat/completions`. |
| `GROQ_MODEL` | e.g. `llama-3.3-70b-versatile`. Read into `provider-config.json`'s `llm.model` at deploy time — never hardcoded in a skill. |

## n8n credential type

`httpHeaderAuth` or `httpBearerAuth` (n8n's generic HTTP credential types), named `groqApiCredential` in the assembled workflow. Attach it to the "Call LLM Provider" HTTP Request node's Authorization configuration — never as a literal header value.

## Endpoint configuration

- **Method**: `POST`
- **URL**: `{GROQ_BASE_URL}` (OpenAI-compatible `/chat/completions` path)
- **Content-Type**: `application/json` (both the header and n8n's `rawContentType` — kept consistent, resolving research.md R16)
- **Body**: the provider-neutral request from `cmmc-editorial-prompt-builder` (`model`, `response_format: {type: 'json_object'}`, `max_tokens`, `temperature`, `messages`)

## Timeout

30,000 ms default (`provider-config.json`'s `llm.timeoutMs`), configurable.

## Retry behavior

Up to `llm.retryCount` (default 3) attempts, `llm.retryDelayMs` (default 5000 ms) apart, **only** for transient failures: network errors (`ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`) or HTTP 408/425/429/500/502/503/504. A 400/401/403/404 is never retried — see `llm-content-generator/scripts/llm-client.js`'s `isTransientError`.

## Expected request

See `specs/001-workflow-governance/contracts/llm-request.schema.json`.

## Expected response

An OpenAI-compatible chat-completion envelope — see `specs/001-workflow-governance/contracts/llm-response.schema.json`. The article JSON itself is a string inside `choices[0].message.content`, parsed separately by `article-response-normalizer`.

## Common failures

| Failure | Handling |
|---|---|
| Non-JSON / malformed envelope | `llm-content-generator` throws immediately — not retried, since it's not a transient network condition |
| Rate limit (429) | Retried up to `retryCount` times with `retryDelayMs` between attempts |
| Timeout | Retried the same way |
| Auth failure (401) | Not retried — surfaces immediately as a `generated`-stage failure for `workflow-observability-reporter` to log (credential-scrubbed) |

## Local / mocked test strategy

All unit and integration tests inject a fake `transport` function into `llm-content-generator`'s `callWithRetry` — no real network call is ever made in tests. See `.specify/skills/llm-content-generator/tests/llm-client.test.js` and the mocked-Groq integration test tasks in `tasks.md` (T024, and the Groq-specific mocked-success/malformed-JSON/timeout/rate-limit integration tests).

## Security requirements

- The API key is never logged, even at debug verbosity — `workflow-observability-reporter` unconditionally scrubs `gsk_...`-shaped substrings and `Bearer ...` headers.
- The key must be revoked and replaced (see `checklists/cmmc-workflow-security.md`) before this workflow is used against a real Groq account, since the source workflow's key is considered compromised.
