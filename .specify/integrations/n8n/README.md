# n8n Integration

**Used by**: all skills, orchestrated by `.specify/skills/n8n-workflow-assembler/`

## Purpose

n8n is the execution runtime for this feature. Every skill's `scripts/*.js` logic runs inside n8n Code nodes (or is called by them); HTTP-based skills (`llm-content-generator`, `wordpress-draft-publisher`) run inside n8n HTTP Request nodes configured with n8n credentials. Spec Kit skills are the documentation-and-contract layer n8n nodes implement against — n8n itself is not replaced or wrapped by a separate runtime.

## Authentication

n8n's built-in credential store holds both the Groq API credential and the WordPress Basic Auth credential. No skill, workflow JSON, or test fixture ever contains a credential value — only a credential **name/reference** (e.g. `groqApiCredential`, `wordpressBasicAuthCredential`).

## Environment variables

n8n environment variables (or the instance's `.env`) supply: `GROQ_MODEL`, `WORDPRESS_BASE_URL`, `WORDPRESS_CATEGORY_ID`, `CMMC_WORKFLOW_DRY_RUN`, `CMMC_DEFAULT_BYLINE`, `CMMC_SCHEDULE_ENABLED`. See `.env.example` at the repository root for the full placeholder list (values only — never real secrets — belong in `.env`, which is git-ignored, never `.env.example`).

## n8n credential types used

| Credential name | n8n credential type | Used by |
|---|---|---|
| `groqApiCredential` | Generic HTTP header/bearer auth | "Call LLM Provider" HTTP Request node |
| `wordpressBasicAuthCredential` | HTTP Basic Auth | "Publish WordPress Draft" HTTP Request node |

## Endpoint configuration

Not applicable at the n8n-instance level — this integration doc describes conventions, not a single endpoint. See `groq/README.md` and `wordpress/README.md` for the actual HTTP integrations.

## Static-data memory conventions

`publication-memory-updater` and `workflow-context-manager` read/write `WorkflowMemory` via `$getWorkflowStaticData('global')` in this iteration (the default storage adapter — see `publication-memory-updater/SKILL.md`'s adapter interface for how to swap in a database later). Only these two skills ever touch static data directly; every other skill receives memory-derived values as explicit node input.

## Node conventions (enforced by n8n-workflow-assembler)

- Every node has a descriptive name matching its responsibility (never the n8n default "HTTP Request", "Code", etc.).
- No Code node reads another node's output via `$('<node name>')` — all data arrives through explicit connections.
- Both a `scheduleTrigger` and a `manualTrigger` node feed the same entry point, so the workflow can be run on a schedule or triggered manually for testing.
- `splitInBatches` (loop) nodes always have their loop-body path reconnected back to themselves.
- The workflow's `active` field is always `false` on import — activation is a manual, deliberate operator action, never automatic.

## Timeout / retry behavior

Configured per HTTP Request node from `provider-config.json` (`llm.timeoutMs`/`retryCount`/`retryDelayMs` for Groq) — WordPress publishing is not auto-retried (see `wordpress/README.md`).

## Common failures

| Failure | Handling |
|---|---|
| Missing/misnamed credential | n8n surfaces a clear credential-resolution error at execution time; `workflow-context-manager`'s config validation should also fail fast if a required credential name isn't configured |
| Static data grows unbounded | Prevented by `workflow-context-manager`'s and `publication-memory-updater`'s cache-limit enforcement (15/30/300 defaults) |

## Local / mocked test strategy

Skill logic is tested with plain Node.js (`node --test`) outside of n8n entirely — every skill's `scripts/*.js` is a pure, dependency-free module callable without an n8n instance. Only the final assembled workflow JSON needs an actual n8n instance (or the n8n CLI) to test import and dry-run execution — see `specs/001-workflow-governance/quickstart.md`.

## Security requirements

- Credentials live only in n8n's credential store, never in exported workflow JSON.
- Before sharing or committing an exported workflow JSON, always run a secret-scan (see `checklists/cmmc-workflow-security.md`) — n8n's export can silently include credential IDs (not values) which is fine, but never re-embeds a raw value unless a user pastes one into a node parameter by mistake, which is exactly the defect being corrected here.
