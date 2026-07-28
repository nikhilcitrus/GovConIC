---

description: "Task list for CMMC Content Publishing Workflow Governance"

---

# Tasks: CMMC Content Publishing Workflow Governance

**Input**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Included — the feature specification requires automated tests and dry-run validation (spec.md §Requirements, task brief §11).

**Organization**: Tasks are grouped by user story (US1-US5, priority order from spec.md) after a Setup and Foundational phase, then closed out with a Polish phase covering workflow assembly, documentation, and security.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on other unfinished tasks in the same batch)
- **[Story]**: US1-US5, or `Setup`/`Foundational`/`Polish`
- Every task names its exact file path(s)

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 [P] [Setup] Create skill directory scaffolding for all 13 skills under `.specify/skills/<skill-name>/` (`workflow-context-manager`, `topic-angle-selector`, `source-content-extractor`, `multi-perspective-planner`, `cmmc-editorial-prompt-builder`, `llm-content-generator`, `article-response-normalizer`, `article-blocks-to-html`, `cmmc-oat-validator`, `wordpress-draft-publisher`, `publication-memory-updater`, `workflow-observability-reporter`, `n8n-workflow-assembler`), each with an empty `SKILL.md` placeholder plus `schemas/`, `examples/`, `scripts/`, `tests/` subdirectories as needed by that skill
- [ ] T002 [P] [Setup] Create `.specify/workflows/cmmc-content-publishing/config/` directory
- [ ] T003 [P] [Setup] Create `.specify/integrations/groq/`, `.specify/integrations/wordpress/`, `.specify/integrations/n8n/` directories
- [ ] T004 [P] [Setup] Create `n8n/source/` and `n8n/generated/` directories
- [ ] T005 [P] [Setup] Create `tests/unit/`, `tests/contract/`, `tests/integration/` directories
- [ ] T006 [Setup] Create `.env.example` at repo root with placeholder-only keys (`GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL`, `WORDPRESS_BASE_URL`, `WORDPRESS_CATEGORY_ID`, `WORDPRESS_USERNAME`, `WORDPRESS_APPLICATION_PASSWORD`, `CMMC_WORKFLOW_DRY_RUN`, `CMMC_DEFAULT_BYLINE`, `CMMC_SCHEDULE_ENABLED`)
- [ ] T007 [Setup] Confirm `.gitignore` excludes `.env` (repair the existing `.gitignore` encoding if needed) so real secrets are never committed

**Checkpoint**: Directory structure exists; no logic yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No skill implementation may begin until configuration and integration contracts exist, since every skill reads from these rather than embedding values in code (FR-044).

- [ ] T008 [Foundational] Create `.specify/workflows/cmmc-content-publishing/config/editorial-config.json` — supported formats, lead-angle rotation (`Unobvious`, `Under the Radar`, `Innovative`), avoided baseline topics, publication brand string (`GovConIC — The Government Contractor Intelligence Center`), default byline
- [ ] T009 [P] [Foundational] Create `.specify/workflows/cmmc-content-publishing/config/validation-config.json` — canonical word/block-count rule (4 `p` @ 20-50 words, 100-200 total, 2 `h2`, 1 `stat`, 1 `pullquote`, 1 `callout`, optional `list`), `wordCountTolerance: 0`, approved CMMC terms list, prohibited-pattern list, companion-asset minimums, cache-size limits (15/30/300)
- [ ] T010 [P] [Foundational] Create `.specify/workflows/cmmc-content-publishing/config/provider-config.json` — provider name, base URL, model, temperature, max tokens, timeout, retry count/delay (no credential values)
- [ ] T011 [Foundational] Write `.specify/integrations/groq/README.md` per the required structure (purpose, auth, env vars, n8n credential type, endpoint, timeout, retry behavior, expected request/response, common failures, mock test strategy, security requirements)
- [ ] T012 [P] [Foundational] Write `.specify/integrations/wordpress/README.md` (same structure, WordPress REST specifics)
- [ ] T013 [P] [Foundational] Write `.specify/integrations/n8n/README.md` (same structure, static-data memory, credential store, manual/schedule trigger conventions)
- [ ] T014 [Foundational] Write `tests/contract/test-config-schema.js` — asserts all three config JSON files parse and contain their required keys; fails fast if any is missing (mirrors FR-045's fail-fast requirement)

**Checkpoint**: Configuration and integration contracts exist and are validated — skill implementation can now begin.

---

## Phase 3: User Story 1 - Generate and publish one validated article (Priority: P1) 🎯 MVP

**Goal**: A standard (non-multi-perspective) run selects topic/format/angle, generates an article via the LLM, validates it, converts it to HTML, and publishes exactly one WordPress draft.

**Independent Test**: Run the standard-mode pipeline against a mocked LLM success response and a mocked WordPress success response; confirm one draft payload is constructed correctly and memory reflects the new headline.

### Tests for User Story 1

- [ ] T015 [P] [US1] Unit test format rotation in `tests/unit/topic-angle-selector.format-rotation.test.js`
- [ ] T016 [P] [US1] Unit test prompt construction (no 4-vs-8 paragraph or 2-vs-2-3 h2 contradiction, subtitle present in schema, GovConIC branding) in `tests/unit/cmmc-editorial-prompt-builder.test.js`
- [ ] T017 [P] [US1] Unit test JSON parsing and schema validation (rejects non-JSON, requires subtitle independently) in `tests/unit/article-response-normalizer.test.js`
- [ ] T018 [P] [US1] Unit test array-or-string field normalization in `tests/unit/article-response-normalizer.array-fields.test.js`
- [ ] T019 [P] [US1] Unit test block-to-HTML conversion and HTML escaping in `tests/unit/article-blocks-to-html.test.js`
- [ ] T020 [P] [US1] Unit test paragraph-only and full-body word count calculation in `tests/unit/article-blocks-to-html.wordcount.test.js`
- [ ] T021 [P] [US1] Unit test WordPress payload generation (draft-only, subtitle meta) in `tests/unit/wordpress-draft-publisher.test.js`
- [ ] T022 [P] [US1] Contract test LLM request/response shape against `contracts/llm-request.schema.json` / `llm-response.schema.json` in `tests/contract/test-llm-contract.js`
- [ ] T023 [P] [US1] Contract test WordPress request/response shape against `contracts/wordpress-request.schema.json` / `wordpress-response.schema.json` in `tests/contract/test-wordpress-contract.js`
- [ ] T024 [US1] Integration test: mocked Groq success → normalize → HTML → OAT pass → WordPress success → memory update, in `tests/integration/test-happy-path.js`

### Implementation for User Story 1

- [ ] T025 [US1] Implement `.specify/skills/workflow-context-manager/SKILL.md` + `scripts/context-manager.js` (memory read, cache-limit enforcement, normalized `WorkflowContext` output, no n8n node-name coupling)
- [ ] T026 [US1] Implement `.specify/skills/topic-angle-selector/SKILL.md` + `scripts/topic-angle-selector.js` (config-driven format/angle rotation reading `editorial-config.json`, avoid-topic logic, deterministic seed mode)
- [ ] T027 [US1] Implement `.specify/skills/cmmc-editorial-prompt-builder/SKILL.md` + `scripts/prompt-builder.js` + `templates/system-prompt.md` + `templates/user-prompt.md` (GovConIC branding, subtitle required in schema, single unambiguous paragraph/h2 rule, recent-headline and avoided-topic exclusions)
- [ ] T028 [US1] Implement `.specify/skills/llm-content-generator/SKILL.md` + `scripts/llm-client.js` (Groq adapter behind a provider-neutral interface, timeout, transient-only retry, credential via n8n credential/env var, `application/json` content type throughout — resolves R16)
- [ ] T029 [US1] Implement `.specify/skills/article-response-normalizer/SKILL.md` + `schemas/article.schema.json` (mirrors `contracts/article.schema.json`) + `scripts/normalize-article.js` (subtitle preserved independently, calculated `bodyWordCount`)
- [ ] T030 [US1] Implement `.specify/skills/article-blocks-to-html/SKILL.md` + `scripts/blocks-to-html.js` (strict 8 block types, reject-unknown-by-default, HTML escaping, order preservation, dual HTML/plain-text + word-count output)
- [ ] T031 [US1] Implement `.specify/skills/cmmc-oat-validator/SKILL.md` + `schemas/oat-result.schema.json` + `scripts/oat-validator.js` (identity/structure, zero-tolerance word/block-count gate, subtitle distinctness, whole-term CMMC relevance matching, duplicate-detection reads only)
- [ ] T032 [US1] Implement `.specify/skills/wordpress-draft-publisher/SKILL.md` + `scripts/wordpress-publisher.js` (always-draft, dry-run support, config-driven category/base URL, credential via n8n credential)
- [ ] T033 [US1] Implement `.specify/skills/publication-memory-updater/SKILL.md` + `scripts/memory-updater.js` (writes only after confirmed publish, storage-adapter interface, dedup-safe append, cache-limit enforcement)
- [ ] T034 [US1] Implement `.specify/skills/workflow-observability-reporter/SKILL.md` + `scripts/reporter.js` (9 required statuses, safe diagnostic fields only, no credential/content leakage)
- [ ] T035 [US1] Implement `.specify/skills/n8n-workflow-assembler/SKILL.md` (skill-to-node mapping table, explicit input/output contracts per node, no `$('<node name>')` lookups — resolves R15)

**Checkpoint**: User Story 1 is fully implementable and testable independently — a standard single-article run can be dry-tested end-to-end against mocks.

---

## Phase 4: User Story 2 - Block invalid content before publication (Priority: P2)

**Goal**: Structurally, editorially, or duplicate-flagged invalid articles are rejected with a specific reason and never reach WordPress.

**Independent Test**: Run the OAT validator alone against a battery of deliberately broken articles (missing subtitle, wrong word count, vendor-PR language, duplicate headline); confirm each produces `passed: false` with the correct reason and confirm the assembled workflow routes only `passed: true` results to publication.

### Tests for User Story 2

- [ ] T036 [P] [US2] Unit test duplicate-title detection (exact + six-word overlap) in `tests/unit/cmmc-oat-validator.duplicate-title.test.js`
- [ ] T037 [P] [US2] Unit test duplicate-content detection (normalized content hash) in `tests/unit/cmmc-oat-validator.duplicate-content.test.js`
- [ ] T038 [P] [US2] Unit test CMMC relevance whole-term matching, including a case that would be a false positive under naive substring matching, in `tests/unit/cmmc-oat-validator.relevance.test.js`
- [ ] T039 [P] [US2] Unit test prohibited-pattern detection in `tests/unit/cmmc-oat-validator.prohibited-patterns.test.js`
- [ ] T040 [P] [US2] Unit test companion-asset validation (alt titles, LinkedIn post, newsletter summary, diagrams, follow-on ideas) in `tests/unit/cmmc-oat-validator.companion-assets.test.js`
- [ ] T041 [US2] Integration test: a batch where every candidate fails OAT produces zero WordPress requests, in `tests/integration/test-all-fail-no-publish.js`
- [ ] T042 [US2] Workflow acceptance test: missing subtitle fails OAT, in `tests/integration/test-missing-subtitle.js`
- [ ] T043 [US2] Workflow acceptance test: invalid word count fails OAT, in `tests/integration/test-word-count-gate.js`
- [ ] T044 [US2] Workflow acceptance test: vendor-PR language is rejected, in `tests/integration/test-vendor-pr-language.js`
- [ ] T045 [US2] Workflow acceptance test: duplicate headline is skipped, in `tests/integration/test-duplicate-headline-skipped.js`

### Implementation for User Story 2

- [ ] T046 [US2] Extend `.specify/skills/n8n-workflow-assembler/SKILL.md` mapping with the explicit pass/fail branch: only `ValidationResult.passed === true` objects (never a `debug_failure`-shaped object) are structurally routable to `wordpress-draft-publisher` — resolves R8
- [ ] T047 [US2] Add attribution/evidence checks (fabricated real-person quote flag, inline numeric-claim attribution requirement, unverifiable-citation warning) to `.specify/skills/cmmc-oat-validator/scripts/oat-validator.js` and `schemas/oat-result.schema.json` warnings array
- [ ] T048 [P] [US2] Unit test attribution/evidence checks in `tests/unit/cmmc-oat-validator.attribution.test.js`

**Checkpoint**: User Story 1 + User Story 2 together deliver a trustworthy, gated single-article pipeline.

---

## Phase 5: User Story 3 - Generate three independent perspective articles from one source (Priority: P3)

**Goal**: Multi-perspective format produces exactly three independently completed articles (Executive, Engineering, Compliance) from one source article.

**Independent Test**: Select multi-perspective format with a valid mocked source article; confirm three generation requests are created sharing one group ID, and confirm all three reach generation/validation/publish-or-reject independently, including when one is made to fail.

### Tests for User Story 3

- [ ] T049 [P] [US3] Unit test source normalization (title/URL/content) in `tests/unit/source-content-extractor.test.js`
- [ ] T050 [P] [US3] Unit test HTML sanitization before prompt inclusion in `tests/unit/source-content-extractor.sanitize.test.js`
- [ ] T051 [P] [US3] Unit test unusable-source rejection (empty content) in `tests/unit/source-content-extractor.unusable.test.js`
- [ ] T052 [P] [US3] Unit test multi-perspective expansion produces exactly 3 requests with correct perspective instructions in `tests/unit/multi-perspective-planner.test.js`
- [ ] T053 [US3] Integration test: one perspective failing OAT does not affect the other two, in `tests/integration/test-multi-perspective-partial-failure.js`
- [ ] T054 [US3] Workflow acceptance test: multi-perspective mode creates exactly three article-generation requests, in `tests/integration/test-multi-perspective-count.js`

### Implementation for User Story 3

- [ ] T055 [US3] Implement `.specify/skills/source-content-extractor/SKILL.md` + `scripts/source-extractor.js` (configurable selectors, defaults `h1`/`.td-post-content`, sanitization, unusable-source rejection — resolves R13)
- [ ] T056 [US3] Implement `.specify/skills/multi-perspective-planner/SKILL.md` + `scripts/multi-perspective-planner.js` (Executive/Engineering/Compliance instructions, shared `groupId`, GovConIC branding — never "Federal Architect" — resolves R11)
- [ ] T057 [US3] Fix `.specify/skills/n8n-workflow-assembler/SKILL.md` batch-loop mapping so the multi-perspective `splitInBatches` node has an explicit loop-back connection to itself, verified against 3/3 completion — resolves R14

**Checkpoint**: User Stories 1-3 cover the full content-generation feature set.

---

## Phase 6: User Story 4 - Validate safely via dry-run without external side effects (Priority: P4)

**Goal**: Dry-run mode executes every stage and reports outcomes without any WordPress call or memory write.

**Independent Test**: Run the pipeline with dry-run enabled; confirm zero WordPress HTTP requests and byte-for-byte unchanged `WorkflowMemory`.

### Tests for User Story 4

- [ ] T058 [US4] Integration test: dry-run executes all stages with zero WordPress calls, in `tests/integration/test-dry-run-no-publish.js`
- [ ] T059 [US4] Integration test: dry-run leaves `WorkflowMemory` unchanged, in `tests/integration/test-dry-run-memory-unchanged.js`
- [ ] T060 [P] [US4] Workflow acceptance test: dry-run mode performs every step except external publication, in `tests/integration/test-dry-run-full-report.js`

### Implementation for User Story 4

- [ ] T061 [US4] Add `dryRun` flag propagation from `workflow-context-manager` through `wordpress-draft-publisher` and `publication-memory-updater` (short-circuit external calls; still emit `dry_run_complete` status)
- [ ] T062 [US4] Wire `CMMC_WORKFLOW_DRY_RUN` environment variable through `.specify/workflows/cmmc-content-publishing/config/provider-config.json` and `workflow.json`

**Checkpoint**: The full pipeline can be safely tested against real credentials without side effects.

---

## Phase 7: User Story 5 - Avoid repetition across runs via persistent memory (Priority: P5)

**Goal**: Format, lead-angle, topic, and headline history persist across runs so consecutive articles vary.

**Independent Test**: Run the pipeline twice in sequence; confirm the second run's format/angle differ per rotation order, and a headline overlapping the first run's output is rejected.

### Tests for User Story 5

- [ ] T063 [P] [US5] Unit test lead-angle rotation order across repeated calls in `tests/unit/topic-angle-selector.angle-rotation.test.js`
- [ ] T064 [P] [US5] Unit test topic exclusion (baseline + pending follow-on) in `tests/unit/topic-angle-selector.exclusion.test.js`
- [ ] T065 [US5] Integration test: two consecutive runs select different format/angle and a duplicate headline is skipped, in `tests/integration/test-rotation-across-runs.js`

### Implementation for User Story 5

- [ ] T066 [US5] Verify/extend `.specify/skills/workflow-context-manager/scripts/context-manager.js` cache-limit enforcement (15/30/300 defaults) under a >1-run test harness invocation

**Checkpoint**: All five user stories are independently functional and testable.

---

## Phase 8: Polish & Cross-Cutting Concerns (Workflow Assembly, Docs, Security)

- [ ] T067 [Polish] Assemble `n8n/generated/govconic-cmmc-content-publishing.json` per the skill-to-node mapping (manual trigger + schedule trigger, dry-run branch, explicit pass/fail gate, no node-name lookups, `active: false`)
- [ ] T068 [P] [Polish] Create `n8n/source/cmmc-prompt-development.original.json` — a secret-scrubbed reference copy of the source workflow (Groq key replaced with a placeholder/credential-reference note; structure otherwise preserved for historical comparison)
- [ ] T069 [Polish] Secret-scan `n8n/generated/govconic-cmmc-content-publishing.json`, `n8n/source/cmmc-prompt-development.original.json`, and all skill/test/doc files for the `gsk_` prefix and other credential-shaped strings — must return zero matches
- [ ] T070 [P] [Polish] Write `.specify/workflows/cmmc-content-publishing/workflow.md` (purpose, triggers, skill sequence, data passed between skills, success/failure paths, retry rules, publication safeguards, memory-update timing, dry-run behavior, observability requirements, rollback/recovery guidance)
- [ ] T071 [P] [Polish] Write `.specify/workflows/cmmc-content-publishing/workflow.json` (validates against `contracts/workflow-manifest.schema.json`, references skill names only)
- [ ] T072 [Polish] Complete `checklists/cmmc-workflow-security.md` (revoke/replace the exposed Groq key, credential storage, export-scrubbing verification, repository-history scan guidance, secret-scanning process, `.env`/`.gitignore` verification)
- [ ] T073 [Polish] Write `specs/001-workflow-governance/quickstart.md` (setup, n8n credential setup, configuration, workflow import, dry-run execution, rollback/troubleshooting)
- [ ] T074 [Polish] Run the full test suite (unit + contract + integration) and record pass/fail results
- [ ] T075 [Polish] Final full-repository secret-scan across every file touched by this feature before reporting completion

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (skills read config, not hardcode it).
- **User Stories (Phase 3-7)**: All depend on Foundational completion.
  - US1 (P1) has no dependency on other stories and is the MVP.
  - US2 (P2) depends on `cmmc-oat-validator` existing from US1 (T031) — extends rather than duplicates it.
  - US3 (P3) depends on US1's assembler skeleton (T035) to attach the source/multi-perspective steps.
  - US4 (P4) depends on US1's publisher/memory-updater (T032, T033) to add the dry-run short-circuit.
  - US5 (P5) depends on US1's context manager/selector (T025, T026) to exercise rotation across runs.
- **Polish (Phase 8)**: Depends on all five user stories being complete.

### Within Each User Story

- Tests are written first and MUST fail before implementation.
- Skills with no dependency on other new skills (context manager, prompt builder scaffolding, source extractor) before skills that consume their output.
- Skill implementation before workflow-assembler mapping updates that reference it.
- Story complete (checkpoint) before moving to the next priority.

### Parallel Opportunities

- All Setup tasks marked [P] run in parallel (different directories).
- All Foundational config/integration-doc tasks marked [P] run in parallel (different files).
- Within a user story, all [P]-marked unit/contract tests run in parallel (different files, no shared state).
- US2, US3, US4, and US5 implementation can proceed in parallel once US1's relevant foundation skills (T025-T035) exist, since each touches a distinct set of skills/files.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (US1) — the standard single-article golden path.
3. **STOP and VALIDATE**: run US1's tests independently against mocks before proceeding.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → validate independently (MVP).
3. US2 → validate independently (quality gate hardened).
4. US3 → validate independently (multi-perspective unlocked).
5. US4 → validate independently (safe to test against real credentials).
6. US5 → validate independently (long-run variety confirmed).
7. Polish → workflow assembly, docs, security, full test run.

## Notes

- [P] tasks touch different files with no shared dependency within their batch.
- Every task names its exact file path so no task requires guessing a location.
- Tests are written before implementation within each user-story phase and must fail first.
- Commit after each task or logical group (only when explicitly requested by the user, per repository convention).
- Stop at any checkpoint to validate a story independently before continuing.
