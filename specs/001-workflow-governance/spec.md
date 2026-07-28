# Feature Specification: CMMC Content Publishing Workflow Governance

**Feature Branch**: `001-workflow-governance`

**Created**: 2026-07-27

**Updated**: 2026-07-28

**Status**: Draft

**Input**: User description: "Convert the existing n8n workflow `n8n/cmmc prompt development.json` into a governed, reusable, testable Spec Kit implementation. Every specialized capability must be a reusable skill under `.specify/skills/`; n8n remains the execution runtime. Spec Kit defines requirements, architecture, reusable skills, workflow orchestration, validation rules, implementation tasks, tests, and governance for a CMMC editorial content-automation system that selects a topic/format/angle, avoids duplicates, generates structured article JSON via an LLM, validates it against an objective acceptance test (OAT), converts it to WordPress HTML, and publishes approved drafts only, updating memory after success."

**Supersedes**: This spec replaces the placeholder "generic workflow governance framework" draft previously held at this path. That draft described the Spec Kit process itself in the abstract; this revision applies it to the concrete CMMC content-publishing system, which is the only initiative currently using this feature branch.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate and publish one validated article (Priority: P1)

As an editorial operator, I want the workflow to select a topic, format, and lead angle; generate a structured article through an LLM; validate it; convert it to WordPress-safe HTML; and publish it as a WordPress draft, so that new CMMC content becomes available for editorial review without manual drafting.

**Why this priority**: This is the end-to-end golden path. Every other capability (multi-perspective, dry-run, memory) is a variation or safeguard on top of it. Without this working reliably, nothing else in the system has value.

**Independent Test**: Trigger the workflow once with valid configuration and a passing article response; confirm exactly one WordPress draft is created with the correct category, subtitle metadata, and HTML body, and that workflow memory reflects the new headline afterward.

**Acceptance Scenarios**:

1. **Given** valid configuration and credentials, **When** the workflow runs end-to-end, **Then** a single WordPress post is created with `status: draft`, the configured category, and subtitle metadata populated from the article's `subtitle`/`dek`.
2. **Given** a successful publish, **When** the run completes, **Then** the recent-headlines list, posted-URL list, and posted-title list are updated exactly once with the new article's data.

---

### User Story 2 - Block invalid content before publication (Priority: P2)

As an editorial operator, I want articles that fail structural, word-count, subtitle, CMMC-relevance, duplicate, or prohibited-language checks to be rejected with a clear, specific reason and never reach WordPress, so that only quality-vetted content is ever drafted under the publication's name.

**Why this priority**: Publishing bad content (or nothing at all, silently) is worse than not publishing. The quality gate is what makes automation trustworthy enough to run unattended on a schedule.

**Independent Test**: Feed a deliberately malformed article (missing subtitle, wrong paragraph/word count, vendor-PR language, or a duplicate headline) through the acceptance-test validator in isolation; confirm it returns `passed: false` with an itemized, human-readable reason, and confirm no WordPress request is ever constructed for that item.

**Acceptance Scenarios**:

1. **Given** an article missing the required `subtitle` field, **When** it is validated, **Then** the result reports `passed: false` with an error naming the missing field, and no substitute value is silently used in its place.
2. **Given** an article whose normalized headline overlaps six or more consecutive words with a previously posted headline, **When** it is validated, **Then** the result reports the specific duplicate reason (six-word overlap) and the item is excluded from publication.
3. **Given** a batch where every candidate fails validation, **When** the run completes, **Then** the failure/diagnostic output for that batch never appears as input to the publication step.

---

### User Story 3 - Generate three independent perspective articles from one source (Priority: P3)

As an editorial operator, given a source article and the multi-perspective format selection, I want the workflow to produce three distinct, fully processed articles (Executive, Engineering, Compliance), each independently generated, validated, and published, so that one source event yields diversified coverage without manual duplication of effort.

**Why this priority**: This is a genuine multiplier on editorial output, but it depends on User Story 1's pipeline already working correctly for a single article; it is additive, not foundational.

**Independent Test**: Select the multi-perspective format for a run with a valid source article; confirm exactly three generation requests are created, all sharing one group identifier, each with perspective-specific instructions; confirm all three are processed to completion (generate → validate → publish or reject) independently.

**Acceptance Scenarios**:

1. **Given** multi-perspective format is selected with a usable source article, **When** the workflow runs, **Then** exactly three generation requests are produced — Executive, Engineering, and Compliance — each carrying the same group identifier and the same source reference.
2. **Given** one of the three perspective articles fails OAT validation, **When** the run completes, **Then** the other two perspectives are still generated, validated, and published (if they pass) without being affected by the failure.
3. **Given** multi-perspective format is selected but the source article is empty or unusable, **When** the workflow runs, **Then** the run reports a clear rejection for source-dependent generation rather than silently producing three articles with blank context.

---

### User Story 4 - Validate safely via dry-run without external side effects (Priority: P4)

As a workflow maintainer, I want to run the entire pipeline in dry-run mode so that generation, validation, and HTML conversion all execute and produce a full report, but no WordPress draft is created and no memory is updated, so that I can test configuration or prompt changes safely against real credentials and real editorial rules without risk of publishing test content.

**Why this priority**: Safe testability is what allows the other stories to be verified and iterated on without risk; it is a cross-cutting safeguard rather than a new content capability.

**Independent Test**: Run the workflow with dry-run enabled; confirm every stage (selection, generation, normalization, HTML conversion, OAT validation) executes and reports its outcome, but confirm no WordPress HTTP request occurs and workflow memory is byte-for-byte unchanged after execution.

**Acceptance Scenarios**:

1. **Given** dry-run mode is enabled, **When** an article passes OAT, **Then** the run reports a `dry_run_complete` status with the article that would have been published, and no publish call is made.
2. **Given** dry-run mode is enabled, **When** the run completes, **Then** workflow memory (recent headlines, posted URLs/titles/hashes, rotation state) is identical before and after the run.

---

### User Story 5 - Avoid repetition across runs via persistent memory (Priority: P5)

As an editorial operator, I want format, lead-angle, topic, and headline history to persist across scheduled runs so that consecutive articles don't repeat the same format, angle, topic, or a near-duplicate headline, so that the publication maintains topical and stylistic variety over time.

**Why this priority**: Variety is a quality-of-life improvement on top of an already-functioning, already-gated pipeline; it does not block core delivery but materially improves long-run content quality.

**Independent Test**: Run the workflow twice in sequence with the same configuration; confirm the second run selects a different format and lead angle than the first (per the configured rotation), and confirm any headline overlapping the first run's output by the configured duplicate threshold is rejected.

**Acceptance Scenarios**:

1. **Given** two consecutive runs, **When** the second run selects a format and lead angle, **Then** it selects the next entry in the configured rotation rather than repeating the first run's selection.
2. **Given** a follow-on topic idea produced by a prior run, **When** a later run selects a topic, **Then** that follow-on idea is treated as an avoided topic until it is either used or ages out of the configured cache limit.

---

### Edge Cases

- The LLM provider returns a non-JSON or truncated response — the run must reject and report `normalization_failed`, not attempt partial parsing.
- The LLM provider times out or returns a rate-limit error — the run must retry only transient failures, up to the configured retry count, then report failure without crashing the batch.
- WordPress publication fails (auth error, validation error, network error) after OAT has already passed — memory must remain unchanged, since it is only updated after confirmed success.
- A structured content block has a type outside the eight supported types — it must be rejected by default rather than rendered through a best-guess fallback.
- All candidates in a batch fail OAT — the batch must terminate the run for that cycle with a `skipped_duplicate`/`oat_failed` style report, and must never forward diagnostic objects to the publish step.
- Required configuration (topics, provider model, WordPress category, etc.) is missing at workflow start — the run must fail fast with a specific configuration error rather than proceeding with silent defaults for editorial rules.
- A duplicate is detected on the second of three multi-perspective articles — only that one article is skipped; the first and third continue independently.

## Requirements *(mandatory)*

### Functional Requirements

**Context & memory**

- **FR-001**: The workflow MUST load prior-run memory (recent headlines, format/angle rotation state, avoided topics, pending follow-on ideas, duplicate history) before selecting a new topic for the current run.
- **FR-002**: The workflow MUST expose a normalized context object to every downstream capability without requiring those capabilities to know the underlying memory storage mechanism.
- **FR-003**: Memory MUST enforce configurable cache-size limits (recent headlines, pending follow-on topics, duplicate-history records) and MUST NOT grow unbounded.

**Topic, format, and angle selection**

- **FR-004**: The workflow MUST select one supported article format and one lead angle per run by rotating over a configuration-defined list, not a list embedded in automation code.
- **FR-005**: The workflow MUST select a narrow topic/angle that avoids configured baseline topics and recently generated follow-on topics.
- **FR-006**: The workflow MUST support a deterministic selection mode when a seed value is supplied, for repeatable testing.
- **FR-007**: The workflow MUST determine generation mode (standard single-article vs. multi-perspective) as part of selection.

**Source content**

- **FR-008**: The workflow MUST normalize an incoming source article's title, URL, and content whenever source-based generation is used.
- **FR-009**: The workflow MUST sanitize extracted source HTML before it is included in any LLM prompt.
- **FR-010**: The workflow MUST reject source-dependent generation (including multi-perspective mode) when required source material is empty or unusable, rather than silently proceeding with blank context.

**Multi-perspective generation**

- **FR-011**: When the multi-perspective format is selected, the workflow MUST generate exactly three independent generation requests: Executive, Engineering, and Compliance.
- **FR-012**: Each of the three requests MUST share a common group identifier and receive perspective-specific instructions plus the same source reference.
- **FR-013**: The workflow MUST process all three perspective requests to completion independently; a failure in one MUST NOT prevent generation, validation, or publication of the other two.

**Prompt construction and generation**

- **FR-014**: The workflow MUST build LLM system/user prompts from configuration-defined editorial rules, not from rules embedded directly in workflow automation code.
- **FR-015**: Prompts MUST exclude recently used headlines and avoided topics supplied by workflow memory.
- **FR-016**: The workflow MUST use a provider-neutral request format so the LLM provider can be substituted without changing prompt-construction logic.
- **FR-017**: The workflow MUST call the configured LLM provider with JSON-mode output, a bounded timeout, and a configurable retry count/delay applied only to transient failures.
- **FR-018**: The workflow MUST NOT log or expose API credentials, complete authorization headers, or — unless explicitly enabled for debugging — full prompt content.

**Response normalization**

- **FR-019**: The workflow MUST parse the LLM's raw response as JSON and reject non-JSON responses with a clear error rather than attempting partial recovery.
- **FR-020**: The workflow MUST normalize alternative field names and array-or-string field variations into one canonical article schema.
- **FR-021**: Every required schema field (including `subtitle`) MUST be treated as independently required; a missing required field MUST produce a validation error and MUST NOT be silently substituted from a different field (e.g., `dek` standing in for a missing `subtitle`).
- **FR-022**: The workflow MUST calculate the actual paragraph-only word count and full-body word count from the normalized content itself, not merely trust a value self-reported by the LLM.

**Block-to-HTML conversion**

- **FR-023**: The workflow MUST convert each supported structured content block type (`p`, `h2`, `h3`, `h4`, `stat`, `pullquote`, `list`, `callout`) to its defined, sanitized HTML output, preserving block order.
- **FR-024**: The workflow MUST escape unsafe HTML found within block content.
- **FR-025**: The workflow MUST reject unknown block types by default rather than guessing a rendering; any fallback rendering mode MUST be explicit, configurable, and covered by tests.
- **FR-026**: The workflow MUST return both HTML and plain-text renderings, plus a paragraph-only word count and a full-body word count.

**Objective acceptance test (OAT) gate**

- **FR-027**: The workflow MUST validate identity and structure: headline present and at least five characters, URL-safe slug, all required schema fields present, and required body-block structure valid.
- **FR-028**: The workflow MUST enforce one unambiguous, configurable word-count and block-count rule — by default: exactly four `p` blocks, 20–50 words per paragraph, 100–200 words total across `p` blocks, exactly two `h2` blocks, exactly one `stat` block, exactly one `pullquote` block, exactly one `callout` block, with `list` blocks optional — and MUST NOT apply any undocumented tolerance; `bodyWordCount` MUST equal the validator's own calculated paragraph-only count.
- **FR-029**: The workflow MUST require a `subtitle` of 30–40 words that is textually distinct from both `dek` and `kicker`.
- **FR-030**: The workflow MUST require at least one approved CMMC term (from a configuration-defined list) to appear in the headline, subtitle, dek, body, or topic context, using whole-term matching rather than naive substring matching.
- **FR-031**: The workflow MUST detect duplicates by source URL, exact normalized headline, six-word headline overlap, normalized content hash, and recent-headline similarity, and MUST report the specific duplicate reason found.
- **FR-032**: The workflow MUST reject content matching configured prohibited/promotional language patterns.
- **FR-033**: The workflow MUST require companion assets: at least five alternative titles, a LinkedIn post of at least 50 characters, a newsletter summary of at least 30 characters, at least one diagram suggestion, and at least five follow-on article ideas.
- **FR-034**: The workflow MUST flag fabricated quotes attributed to named real people, require inline attribution for numerical claims, and flag unverifiable citations for human review, rather than presenting generated facts as verified facts.
- **FR-035**: The workflow MUST NOT update any duplicate-detection cache until after publication has actually succeeded.

**Publication**

- **FR-036**: The workflow MUST publish only OAT-passed articles, always as WordPress drafts (never any other status) unless dry-run mode is enabled.
- **FR-037**: The workflow MUST set the configured category, subtitle metadata, and — when supplied — featured media on the created draft.
- **FR-038**: The workflow MUST support a dry-run mode that executes every stage except the actual external publish call.
- **FR-039**: The workflow MUST prevent any diagnostic, debug, or failure object from ever reaching the publication step.

**Memory update**

- **FR-040**: The workflow MUST update recent headlines, pending follow-on topics, posted source URLs, posted normalized titles, posted content hashes, and the successful-publication count only after WordPress confirms successful draft creation.
- **FR-041**: The workflow MUST avoid duplicate entries when updating memory and MUST enforce the configured cache limits.

**Observability**

- **FR-042**: The workflow MUST emit structured status events (`selected`, `generated`, `normalization_failed`, `oat_failed`, `publication_failed`, `published`, `memory_updated`, `skipped_duplicate`, `dry_run_complete`), each including run ID, article ID, group ID when applicable, stage, duration, retry count, and pass/fail status.
- **FR-043**: Logs MUST NOT contain credentials, passwords, full authorization headers, or — unless explicitly permitted — full prompt or sensitive source content.

**Configuration and secrets**

- **FR-044**: All topics, formats, lead angles, avoided baseline topics, CMMC terms, prohibited patterns, word/block-count rules, companion-asset limits, cache sizes, provider model, retry limits, and WordPress defaults MUST be defined in configuration, not embedded in workflow automation code.
- **FR-045**: The workflow MUST validate required configuration at startup and fail fast with a specific error when required configuration is missing.
- **FR-046**: All credentials (LLM provider, WordPress) MUST be supplied via the automation runtime's credential store or environment variables, and MUST NEVER be embedded in source-controlled files.

**Reusability and governance**

- **FR-047**: Every major capability (context management, topic/angle selection, source extraction, multi-perspective planning, prompt building, generation, response normalization, block-to-HTML conversion, OAT validation, publication, memory update, observability, workflow assembly) MUST be implemented as an independently documented, reusable skill rather than as inline automation-tool code.
- **FR-048**: The orchestration workflow MUST reference skills by explicit contract and MUST NOT depend on fragile internal node-name lookups to pass data between stages.

### Key Entities *(include if feature involves data)*

- **Article**: The canonical generated-content object — headline, slug, section, kicker, subtitle, dek, byline, date, readMinutes, bodyWordCount, body (ordered content blocks), altTitles, linkedinPost, newsletterSummary, suggestedDiagrams, followOnIdeas.
- **ContentBlock**: One typed unit of article body content (`p`, `h2`, `h3`, `h4`, `stat`, `pullquote`, `list`, `callout`) plus its text/value payload.
- **GenerationRequest**: The provider-neutral request built for one article — topic, format, leadAngle, avoidTopics, recentHeadlines, optional perspective, optional group ID, optional source reference.
- **SourceArticle**: A normalized reference article — title, URL, sanitized content — used for source-based and multi-perspective generation.
- **MultiPerspectiveGroup**: A set of exactly three GenerationRequests (Executive, Engineering, Compliance) sharing one group ID and one SourceArticle.
- **ValidationResult (OAT Result)**: The output of the acceptance-test gate — passed flag, errors, warnings, metrics, and the normalized article.
- **WorkflowMemory**: Persistent state across runs — recent headlines, pending follow-on topics, posted URLs/titles/content hashes, rotation indices, successful-publication count, last-publication timestamp.
- **PublicationRecord**: The result of a successful WordPress draft creation — post identifier, status, category, timestamp, source reference, and group ID when applicable.
- **ProviderConfig**: Non-secret LLM provider configuration — provider name, base URL, model, temperature, max tokens (credentials are never part of this entity).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of created WordPress drafts have passed every OAT category before the publish call is made.
- **SC-002**: 0% of failed-publication runs result in a duplicate-detection cache update.
- **SC-003**: 0 diagnostic/debug objects are ever observed reaching the publication step across all test executions.
- **SC-004**: Multi-perspective mode produces exactly 3 independently completed generation attempts in 100% of runs where multi-perspective format is selected and a usable source article is supplied (independent per-perspective OAT rejection is expected behavior, not a defect).
- **SC-005**: 0 credentials are found in any generated workflow export or log file, verified by secret-scanning before each release.
- **SC-006**: Dry-run mode completes 100% of pipeline stages with 0 external publish calls across all test executions.
- **SC-007**: Across any 6 consecutive scheduled runs, format and lead-angle selections follow the configured rotation order with 0 unintended repeats before a full cycle completes.

## Clarifications

The source workflow being replaced contained several internally contradictory or ambiguous rules. Rather than silently picking one interpretation, each is resolved explicitly below (full detail, rationale, and acceptance test for each lives in `research.md`):

1. **Paragraph count vs. "eight paragraphs" reference** → Canonical rule is exactly 4 `p` blocks (FR-028); the "eight paragraphs" reference in the prior prompt was an internal contradiction and is discarded.
2. **"Exactly 2 h2" vs. "2-3 h2"** → Canonical rule is exactly 2 `h2` blocks (FR-028).
3. **Subtitle required but missing from schema/parser** → `subtitle` is now a first-class required field in the schema, prompt, and parser (FR-021, FR-029); it is never silently backfilled from `dek`.
4. **1,000–1,500 word comment vs. 100–200 constants** → Canonical total is 100–200 words across `p` blocks only (FR-028); the 1,000–1,500 comment was stale documentation, not a real rule, and is discarded.
5. **Hidden ±50-word tolerance** → No hidden tolerance. If a tolerance is ever needed it must be an explicit, documented configuration value (FR-028) — the default is zero tolerance.
6. **Word count calculated but not validated/returned** → The validator MUST calculate and return the paragraph-only count and require it to equal `bodyWordCount` (FR-022, FR-028).
7. **Diagnostic objects able to reach WordPress** → Explicitly forbidden; a diagnostic/debug object must never be structurally compatible with the publish step's expected input (FR-039).
8. **Duplicate caches updated before publish confirmation** → Explicitly forbidden; caches update only after confirmed WordPress success (FR-035, FR-040).
9. **Embedded Groq API key** → Treated as compromised; revoked and replaced outside version control (see `checklists/cmmc-workflow-security.md`, tracked separately from this spec).
10. **Legacy "Federal Architect" branding in multi-perspective prompts** → Replaced with "GovConIC — The Government Contractor Intelligence Center" in all newly generated content (FR-014).
11. **Arbitrary unknown-block-type fallback HTML** → Rejected by default; any fallback is explicit, configured, and tested (FR-025).
12. **Source extraction (`HTML` node) disconnected from the live path** → Source extraction is now a directly wired, testable skill with an explicit "unusable source" rejection path (FR-008–FR-010).
13. **Broken multi-perspective loop (only 1 of 3 items ever processed)** → The reassembled workflow must process all three multi-perspective items to completion independently, verified by an acceptance test (FR-011, FR-013).

## Out of Scope

- Automatic (non-draft) publication, or automatic activation of the generated n8n workflow.
- Support for CMS platforms other than WordPress in this iteration.
- Permanent coupling to a single LLM vendor — only an initial Groq adapter is required, but the architecture must not preclude substituting another OpenAI-compatible provider later.
- A human review UI/dashboard — this iteration provides clear rejection reasons and structured logs, not a review interface.
- Automated credential rotation tooling — rotation of the exposed Groq key is a one-time manual security action (tracked in the security checklist), not a workflow feature.

## Assumptions

- n8n remains the execution runtime; Spec Kit skills are documentation-plus-contract artifacts consumed by n8n nodes, not a separate runtime.
- Groq's OpenAI-compatible chat completions endpoint is the only wired LLM integration at this stage; other OpenAI-compatible providers are an architectural allowance, not a current requirement.
- WordPress's REST API with application-password/basic-auth (via n8n credentials) is the only wired publishing target at this stage.
- The single canonical word-count and block-count rule defined in FR-028 is adopted as the resolved interpretation of the source workflow's contradictory rules, per the Clarifications section above.
- The Groq API key found embedded in the source workflow is treated as compromised; no new file in this repository will contain it, and its revocation/replacement is tracked as a manual operational action outside this spec's automated scope.
