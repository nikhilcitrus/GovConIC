# WordPress Integration

**Used by**: `.specify/skills/wordpress-draft-publisher/`

## Purpose

Create approved CMMC articles as WordPress **draft** posts via the WordPress REST API — never any other status, and never automatically published.

## Authentication

HTTP Basic Auth using a WordPress **application password** (not the account login password). Configured as an n8n credential — never embedded in workflow JSON or skill code.

## Environment variables

| Variable | Purpose |
|---|---|
| `WORDPRESS_BASE_URL` | e.g. `https://your-site.example.com` — no trailing slash. Never hardcoded in a skill; read into `provider-config.json`'s `wordpress.baseUrl`. |
| `WORDPRESS_CATEGORY_ID` | The target category's numeric ID. |
| `WORDPRESS_USERNAME` | The WordPress user the application password belongs to. |
| `WORDPRESS_APPLICATION_PASSWORD` | The application password value. Stored **only** in the n8n credential store or the runtime environment. |

## n8n credential type

`httpBasicAuth`, named `wordpressBasicAuthCredential` in the assembled workflow, using `WORDPRESS_USERNAME` / `WORDPRESS_APPLICATION_PASSWORD` as its username/password fields.

## Endpoint configuration

- **Method**: `POST`
- **URL**: `{WORDPRESS_BASE_URL}/wp-json/wp/v2/posts`
- **Content-Type**: `application/json`

## Timeout

Inherits the n8n HTTP Request node default unless overridden; no special timeout is required for a single draft-creation call.

## Retry behavior

WordPress publish attempts are **not** automatically retried by default — a failed publish call must be reported (`publication_failed`) rather than silently retried, since retrying a create-post call risks duplicate drafts. If retry is desired, it must be explicit and idempotency-safe (e.g., checking for an existing draft with the same slug first) — not part of this iteration's scope.

## Expected request

See `specs/001-workflow-governance/contracts/wordpress-request.schema.json`. Always `status: "draft"`.

## Expected response

WordPress's standard post-creation response (`id`, `status`, `date_gmt`, etc.), normalized by `wordpress-draft-publisher` into a `PublicationRecord` — see `specs/001-workflow-governance/contracts/wordpress-response.schema.json`.

## Common failures

| Failure | Handling |
|---|---|
| 401 Unauthorized | Credential misconfigured or application password revoked — surfaces as `publication_failed`, memory is **not** updated (research.md R9) |
| 400 Bad Request (invalid category, malformed meta) | Surfaces as `publication_failed` with the WordPress error body (credential-scrubbed) logged |
| Network/timeout error | Surfaces as `publication_failed`; the run must not assume the draft was created |

## Local / mocked test strategy

Unit and integration tests inject a fake `transport` function into `wordpress-draft-publisher`'s `publishDraft` — no real WordPress instance is contacted in tests. See `.specify/skills/wordpress-draft-publisher/tests/wordpress-publisher.test.js`.

## Security requirements

- Use an application password scoped to the minimum necessary capability (create posts in the target category), not a full-admin account password.
- Never log the application password or the Basic Auth header value — `workflow-observability-reporter` scrubs `authorization`/`password` key-value patterns unconditionally.
- The WordPress base URL is a configuration value, never hardcoded inside a reusable skill (the source workflow hardcoded a staging domain directly in its HTTP node — this integration replaces that with `WORDPRESS_BASE_URL`).
