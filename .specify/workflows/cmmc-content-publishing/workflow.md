# Workflow: CMMC Content Publishing

**Manifest**: [workflow.json](./workflow.json) | **Spec**: [../../../specs/001-workflow-governance/spec.md](../../../specs/001-workflow-governance/spec.md)

## Purpose

Select a CMMC topic/format/angle, generate one or three (multi-perspective) structured articles via an LLM, validate them against the objective acceptance test (OAT), convert approved content to WordPress-safe HTML, and publish only approved articles as WordPress drafts — updating workflow memory only after a confirmed publish.

## Trigger types

- **Schedule Trigger** — runs on an interval (default every 180 minutes; configurable via the schedule node, gated in practice by whether `CMMC_SCHEDULE_ENABLED` is true and the workflow is manually activated in n8n — see `quickstart.md`).
- **Manual Trigger** — for on-demand runs and testing (dry-run or live).

Both triggers feed the same entry point (`Load Workflow Configuration`), so behavior is identical regardless of how the run started.

## Skill sequence (maps to `workflow.json` steps)

1. `n8n-workflow-assembler` (implicit — this is the assembled workflow itself; listed as the first manifest step for traceability, not a runtime call)
2. `workflow-context-manager` — load memory, advance format/lead-angle rotation, trim caches, produce `WorkflowContext`
3. `source-content-extractor` — normalize + sanitize a source article if one is wired in upstream of "Source Article Input" (optional extension point; see below)
4. `topic-angle-selector` — pick a narrow topic, confirm generation mode (standard vs. multi-perspective), reject source-dependent runs when no usable source exists
5. `multi-perspective-planner` — when multi-perspective mode is selected, expand into exactly 3 `GenerationRequest`s (Executive, Engineering, Compliance)
6. `cmmc-editorial-prompt-builder` — build the provider-neutral LLM request from config (never from hardcoded prose)
7. `llm-content-generator` — call Groq (or any configured OpenAI-compatible provider), retry only transient failures
8. `article-response-normalizer` — parse and normalize the raw JSON into a canonical `Article`, independently requiring `subtitle`
9. `article-blocks-to-html` — convert content blocks to sanitized HTML, reject unknown block types by default
10. `cmmc-oat-validator` — the acceptance gate: structure, word/block counts (zero hidden tolerance), subtitle, CMMC relevance (whole-term matching), duplicates (read-only), prohibited patterns, companion assets, attribution/evidence warnings
11. `wordpress-draft-publisher` (branch: OAT passed) — build the WordPress payload and create a draft, or report what would be created in dry-run mode
12. `workflow-observability-reporter` (branch: OAT failed) — log the specific rejection reason; this branch never reaches step 11
13. `publication-memory-updater` — runs only after a confirmed WordPress draft exists; updates recent headlines, follow-on topics, posted URLs/titles/hashes
14. `workflow-observability-reporter` — logs the final `published` event

## Data passed between skills

See `specs/001-workflow-governance/data-model.md` for full entity shapes (`WorkflowContext`, `SourceArticle`, `GenerationRequest`, `Article`, `ValidationResult`, `PublicationRecord`, `WorkflowMemory`). In the assembled n8n workflow, data flows exclusively through explicit node connections — two `Merge` nodes (`Combine LLM Response With Request`, `Combine WordPress Response With Article`) reunite an HTTP response with its originating request item so that no Code node ever needs a fragile `$('<node name>')` lookup (resolves research.md R15).

## Success path

Schedule/Manual Trigger → Load Workflow Configuration → Load Workflow Memory And Select Rotation → Source Article Input → Sanitize Source Article → Select Topic And Mode → Check Source Rejected (false) → Check Multi Perspective Mode → (Plan Multi-Perspective Requests *or* Wrap Standard Generation Request) → Batch Generation Requests (loop) → Build Editorial Prompt → Call LLM Provider → Combine LLM Response With Request → Normalize Article Response → Convert Blocks To HTML → Run OAT Validation → Route OAT Pass Fail (true) → Check Dry Run Mode (false/live) → Publish WordPress Draft → Combine WordPress Response With Article → Update Publication Memory → Log Published Event → back to Batch Generation Requests → (loop until done) → Emit Execution Report.

## Failure paths

| Failure point | What happens |
|---|---|
| Source required but unusable (multi-perspective mode) | `Check Source Rejected` routes to `Log Skipped Duplicate Or Rejected`; the run ends for this cycle without ever building a prompt |
| LLM call fails (transient) | `Call LLM Provider` retries up to 3 times, 5s apart (n8n's `retryOnFail`/`maxTries`/`waitBetweenTries`) |
| LLM call fails (non-transient) or returns malformed JSON | `Normalize Article Response` sets `normalizationValid: false`; `Convert Blocks To HTML` and `Run OAT Validation` short-circuit to a failure result; routed to `Log OAT Failure`, never to publication |
| OAT fails | `Route OAT Pass Fail` routes to `Log OAT Failure` — the article/debug data is never forwarded to `Publish WordPress Draft` (resolves research.md R8) |
| WordPress call fails | The HTTP Request node throws (no `continueOnFail`), so `Update Publication Memory` is never reached — memory is provably unchanged (resolves research.md R9) |

## Retry rules

- LLM calls: up to 3 attempts, 5000ms apart, on transient failures only (network errors, 408/425/429/500/502/503/504) — see `llm-content-generator/SKILL.md`.
- WordPress publish calls: **not** auto-retried (retrying a create-post call risks duplicate drafts) — a failure is reported as `publication_failed` and the item is simply not published this cycle; the next scheduled run's dedup/rotation logic naturally offers another chance with fresh content.

## Publication safeguards

- `status` is always `"draft"` — never any other value, dry-run or not.
- The workflow's `active` field is always `false` on import/export; activation is a manual operator action.
- Only `ValidationResult.passed === true` items are structurally routable to `wordpress-draft-publisher` — enforced by `Route OAT Pass Fail`.
- Duplicate-detection caches (`postedUrls`, `postedTitles`, `postedContentHashes`, `recentHeadlines`) are only ever written by `Update Publication Memory`, which only runs after a confirmed WordPress response.

## Memory-update timing

Format/lead-angle rotation indices advance on **every** run (in `Load Workflow Memory And Select Rotation`), regardless of publish outcome — this is intentional: rotation variety doesn't need transactional guarantees. Duplicate-detection/headline history, by contrast, updates **only** after a confirmed publish (`Update Publication Memory`) — see research.md R9.

## Dry-run behavior

When `CMMC_WORKFLOW_DRY_RUN=true`, `Check Dry Run Mode` routes every OAT-passed item to `Log Dry Run Complete` instead of `Publish WordPress Draft`. Every other stage (selection, generation, normalization, HTML conversion, OAT validation) runs exactly as it would live — only the external WordPress call and the memory update are skipped, so dry-run output is a faithful preview of what would have been published.

## Observability requirements

Every branch — success, OAT failure, dry-run, and (implicitly, via the HTTP node's own error reporting) publish failure — logs a structured event via `workflow-observability-reporter`'s status vocabulary (`selected`, `generated`, `normalization_failed`, `oat_failed`, `publication_failed`, `published`, `memory_updated`, `skipped_duplicate`, `dry_run_complete`). No log message ever contains a credential, password, or full Authorization header — scrubbing is unconditional.

## Rollback / recovery guidance

- **A bad publish happened**: manually delete/unpublish the WordPress draft; no automated rollback is provided (drafts require human review anyway — they are never auto-published).
- **Memory looks wrong** (e.g., a headline was recorded that shouldn't have been): the workflow's static data can be edited directly in the n8n UI (`Workflow Settings → Static Data`, or via the API) — there is no separate database to reconcile in this iteration.
- **The workflow is misbehaving**: deactivate it in n8n immediately (it should already be inactive on import) and re-run in dry-run mode to diagnose before reactivating.
- **A skill's logic changed**: the corresponding n8n Code node's inlined `jsCode` must be regenerated/updated to match — see `.specify/skills/n8n-workflow-assembler/SKILL.md`'s note on the skill-scripts-are-source-of-truth convention, and re-run `validate-workflow.js` before re-importing.

## Extension point: source article ingestion

The source workflow's own source-extraction path was disconnected (research.md R13). This workflow fixes the *processing* side (sanitization, usability-checking) but does not invent new RSS/scraping infrastructure the original task didn't request. `Source Article Input` is a `Set` node defaulting to an empty source (safe for standard scheduled runs, which don't need one); to enable multi-perspective mode in production, wire an RSS Feed Read + HTML-extraction node (using the selectors in `editorial-config.json`'s `sourceExtraction.selectors`) ahead of it.
