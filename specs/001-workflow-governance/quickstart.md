# Quickstart: CMMC Content Publishing Workflow

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Workflow**: [../../.specify/workflows/cmmc-content-publishing/workflow.md](../../.specify/workflows/cmmc-content-publishing/workflow.md)

## 1. Prerequisites

- An n8n instance (self-hosted or cloud) you can import workflows into and configure credentials on.
- A Groq account and API key (the one embedded in the old source workflow is **compromised** — do not reuse it; see step 2).
- A WordPress site with the REST API enabled and an application password you can generate.
- Node.js 18+ installed locally if you want to run this repository's test suite (`node --test`, no `npm install` required — every skill script is dependency-free).

## 2. Security: revoke and replace the exposed credential first

Before doing anything else, complete the first three items of `checklists/cmmc-workflow-security.md`:

1. Revoke the Groq API key found in `n8n/cmmc prompt development.json` (treat it as already compromised).
2. Generate a new Groq API key.
3. Do not paste it into any file in this repository — it belongs only in your `.env` (git-ignored) or your n8n credential store.

## 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env` with real values:

| Variable | Notes |
|---|---|
| `GROQ_API_KEY` | Your new key — used only to create the n8n credential below, never referenced directly by the workflow JSON |
| `GROQ_BASE_URL` | `https://api.groq.com/openai/v1/chat/completions` |
| `GROQ_MODEL` | e.g. `llama-3.3-70b-versatile` |
| `WORDPRESS_BASE_URL` | Your site, no trailing slash |
| `WORDPRESS_CATEGORY_ID` | The numeric category ID for CMMC content |
| `WORDPRESS_USERNAME` | The WordPress user the application password belongs to |
| `WORDPRESS_APPLICATION_PASSWORD` | Generated from WordPress Users → Profile → Application Passwords |
| `CMMC_WORKFLOW_DRY_RUN` | `true` for your first import/test run |
| `CMMC_DEFAULT_BYLINE` | Fallback byline when the LLM omits one |
| `CMMC_SCHEDULE_ENABLED` | `false` until you've verified a dry run |

`.env` is git-ignored (see the repaired `.gitignore` at the repo root) — never commit it.

## 4. Set up n8n credentials

In your n8n instance:

1. **Credential 1** — `groqApiCredential`: a Generic Header/Bearer Auth credential with `Authorization: Bearer <your new GROQ_API_KEY>`.
2. **Credential 2** — `wordpressBasicAuthCredential`: an HTTP Basic Auth credential using `WORDPRESS_USERNAME` / `WORDPRESS_APPLICATION_PASSWORD`.
3. Also set `GROQ_MODEL`, `GROQ_BASE_URL`, `WORDPRESS_BASE_URL`, `WORDPRESS_CATEGORY_ID`, `CMMC_WORKFLOW_DRY_RUN`, `CMMC_DEFAULT_BYLINE` as **n8n environment variables** (Settings → Environment, or your instance's env configuration) so the workflow's `Load Workflow Configuration` node can read them via `$env`.

See `.specify/integrations/groq/README.md` and `.specify/integrations/wordpress/README.md` for full detail.

## 5. Import the workflow

1. In n8n: **Workflows → Import from File**.
2. Select `n8n/generated/govconic-cmmc-content-publishing.json`.
3. After import, open the two HTTP Request nodes ("Call LLM Provider", "Publish WordPress Draft") and attach the two credentials created in step 4 — the imported JSON references credentials by name/placeholder ID only and will prompt you to reassign them.
4. **Confirm the workflow shows as inactive** (the toggle in the top-right should be off). This is intentional — the JSON always imports with `active: false`; do not activate it until you've completed a successful dry run.

## 6. Run a dry-run test

1. Ensure `CMMC_WORKFLOW_DRY_RUN=true` in your n8n environment.
2. Click **Execute Workflow** (this fires the Manual Trigger).
3. Confirm in the execution log:
   - `Select Topic And Mode` selected a format/topic/angle.
   - `Call LLM Provider` returned a response (check for a 2xx status in the node's output).
   - `Run OAT Validation` shows `oatPassed: true` for a well-formed test response (if it's `false`, inspect `oatErrors` — this is expected the first few times while you tune the LLM's actual output against the strict schema).
   - `Check Dry Run Mode` routed to `Log Dry Run Complete`, **not** `Publish WordPress Draft`.
   - No item reached `Update Publication Memory`.
4. Optionally, run the repository's own test suite locally to validate the underlying skill logic independent of n8n:

```bash
node --test ".specify/skills/**/tests/*.test.js" "tests/**/*.js"
```

All 156 tests should pass.

## 7. Go live (only after a clean dry run)

1. Set `CMMC_WORKFLOW_DRY_RUN=false`.
2. Run **Execute Workflow** once manually and confirm a real WordPress **draft** (never published) appears in your WordPress admin, in the configured category, with the subtitle populated.
3. Only then set `CMMC_SCHEDULE_ENABLED=true` and activate the workflow in n8n if you want it to run on the Schedule Trigger's interval (default every 180 minutes — adjust the Schedule Trigger node's interval to your preference first).

## 8. Multi-perspective mode (optional)

The workflow ships with a `Source Article Input` placeholder node that defaults to an empty source. To enable multi-perspective generation:

1. Add an RSS Feed Read (or scraper) node ahead of `Source Article Input`, feeding it `sourceTitle`, `sourceUrl`, `sourceContentHtml`.
2. The `Sanitize Source Article` node will sanitize it; `Select Topic And Mode` will only enter multi-perspective mode when the format rotation lands on `multi-perspective-source-analysis` **and** the source is usable — otherwise it's safely skipped, not silently broken.

## 9. Rollback and troubleshooting

- **Wrong content got drafted**: delete/edit the draft directly in WordPress — nothing is ever auto-published, so this is a low-stakes cleanup, not an incident.
- **Workflow behaving unexpectedly**: deactivate it in n8n immediately, switch back to `CMMC_WORKFLOW_DRY_RUN=true`, and re-run manually to diagnose using the structured log events (`workflow-observability-reporter`'s statuses) before reactivating.
- **A run keeps getting `oat_failed`**: read the `oatErrors` array in `Run OAT Validation`'s output — every failure code is specific (e.g. `wrong_paragraph_count`, `missing_subtitle`, `not_cmmc_relevant`); adjust your prompt expectations or `validation-config.json` deliberately, never by adding a silent tolerance.
- **Memory/rotation looks wrong**: inspect/edit via n8n's Workflow Static Data (accessible from workflow settings or the API) — see `workflow.md`'s rollback section.
- **Need to change editorial rules, word counts, CMMC terms, or provider settings**: edit `.specify/workflows/cmmc-content-publishing/config/*.json` **and** the matching embedded values inside the `Load Workflow Configuration` / `Build Editorial Prompt` / `Run OAT Validation` Code nodes in the n8n JSON — they must be kept in sync (see `n8n-workflow-assembler/SKILL.md`), then re-run `node --test` before re-importing.

## 10. Full test commands reference

```bash
# All 13 skills' unit tests
node --test ".specify/skills/**/tests/*.test.js"

# Config contract test + integration/workflow-acceptance tests
node --test "tests/**/*.js"

# Everything together
node --test ".specify/skills/**/tests/*.test.js" "tests/**/*.js"

# Structural validation of the generated workflow JSON only
node -e "const {validateWorkflowJson}=require('./.specify/skills/n8n-workflow-assembler/scripts/validate-workflow');const wf=JSON.parse(require('fs').readFileSync('n8n/generated/govconic-cmmc-content-publishing.json','utf8'));console.log(validateWorkflowJson(wf))"
```
