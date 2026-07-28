# Research & Contradiction Resolution: CMMC Content Publishing Workflow

**Feature**: [spec.md](./spec.md)
**Source analyzed**: `n8n/cmmc prompt development.json` (10 nodes; `active: false`)
**Purpose**: Record every ambiguous or contradictory rule found in the source workflow, the risk it poses, the resolution adopted, and the acceptance test that proves the resolution. Per the constitution's Governed Change principle, no contradiction is silently picked — each is documented here.

Each entry below corresponds to a functional requirement in [spec.md](./spec.md) (referenced as FR-###).

---

## R1. Paragraph count: "exactly four" vs. "eight paragraphs"

- **Observed behavior**: The system prompt in the `Code in JavaScript2` node states "The body MUST contain EXACTLY: - 4 paragraph ("p") blocks" and separately states "The total words across the **eight** paragraphs must be between 100 and 200."
- **Risk**: The LLM has no way to satisfy both instructions simultaneously; in practice it will pick one interpretation unpredictably, making the OAT paragraph-count check (which expects 4) fail non-deterministically.
- **Resolution**: Canonical rule is **exactly 4 `p` blocks**. The "eight paragraphs" reference is discarded as an editing artifact — it does not correspond to any other rule in the source (no other section ever mentions 8 of anything). Enforced in `cmmc-oat-validator` and stated once, unambiguously, in `cmmc-editorial-prompt-builder`'s generated prompt.
- **Acceptance test**: Given a generated article with exactly 4 `p` blocks, OAT passes the structure check; given 3, 5, or 8 `p` blocks, OAT fails with an explicit "expected 4 paragraph blocks, found N" error.
- **Maps to**: FR-028.

## R2. H2 count: "exactly two" vs. "two to three"

- **Observed behavior**: The strict schema section says "2 h2 blocks"; a later prose line says "Include 2-3 'h2' blocks as section breaks."
- **Risk**: Same non-determinism as R1 — the validator's exact-count check would reject an LLM output that followed the "2-3" guidance instead of "exactly 2."
- **Resolution**: Canonical rule is **exactly 2 `h2` blocks**. The "2-3" phrasing is discarded for the same reason as R1 — it is the looser, non-normative restatement, and the strict schema block is treated as authoritative since it is what the acceptance gate actually enforces.
- **Acceptance test**: An article with exactly 2 `h2` blocks passes; 1 or 3 `h2` blocks fails with an explicit count error.
- **Maps to**: FR-028.

## R3. Subtitle required by prose, absent from the JSON schema shown to the LLM

- **Observed behavior**: The system prompt has a dedicated "Subtitle requirement (STRICT, REQUIRED FIELD)" paragraph demanding a non-empty `subtitle` of 30-40 words — but the JSON schema block immediately below it (the literal field list the LLM is told to return) never lists `subtitle` as a key at all.
- **Risk**: An LLM following the explicit schema list (which is what most models weight most heavily) will never emit `subtitle`, making the prose requirement unenforceable and the eventual OAT subtitle check fail on every run.
- **Resolution**: `subtitle` is added as an explicit, required key in the schema shown to the LLM, in the JSON Schema under `article-response-normalizer/schemas/`, and in the OAT gate. It is required independently of `dek`/`kicker` — never inferred from them.
- **Acceptance test**: A response missing `subtitle` is rejected by `article-response-normalizer` with a specific "missing required field: subtitle" error, distinct from any `dek`-related error.
- **Maps to**: FR-021, FR-029.

## R4. Parser drops `subtitle` even when present

- **Observed behavior**: `Code in JavaScript1` builds its output object from `parsed.headline`, `parsed.slug`, `parsed.section`, `parsed.kicker`, `parsed.dek`, `parsed.byline`, etc. — it never reads `parsed.subtitle` at all, so even if the LLM did return one, it would be discarded before the OAT stage ever saw it.
- **Risk**: Silent data loss — a structurally valid, compliant LLM response could still fail OAT downstream for a reason (missing subtitle) that isn't actually true, or (if the OAT check is skipped) publish content missing subtitle metadata WordPress expects.
- **Resolution**: `article-response-normalizer` explicitly maps `parsed.subtitle` into the normalized article object as a top-level, independently required field, and `wordpress-draft-publisher` maps it into `meta.td_post_theme_settings.td_subtitle` alongside/instead of `dek` per the resolved payload contract (see `data-model.md`).
- **Acceptance test**: Given a raw LLM response containing a `subtitle` field, the normalized article object exposes `article.subtitle` unchanged.
- **Maps to**: FR-021.

## R5. OAT comment says 1,000-1,500 words; constants say 100-200

- **Observed behavior**: `Code in JavaScript5` contains the comment `// --- Word count gate (1,000-1,500 words) ---` directly above `const MIN_WORDS = 100; const MAX_WORDS = 200;`.
- **Risk**: Stale documentation actively misleads future maintainers into "fixing" the constants to match the comment, which would silently 5-10x the required article length and break every other rule tuned around a ~150-word body (paragraph counts, companion-asset expectations, etc.).
- **Resolution**: The comment is discarded as stale; **100-200 words** (paragraph-only) is the canonical total, matching the constants that were actually enforced and consistent with the "20-50 words per paragraph × 4 paragraphs" arithmetic (80-200 word range, narrowed to 100-200 by the prompt).
- **Acceptance test**: `validation-config.json` documents 100-200 as the total word range with no reference to 1,000-1,500 anywhere in the codebase or generated prompts.
- **Maps to**: FR-028.

## R6. Hidden ±50-word tolerance contradicts the "strict/no exceptions" framing

- **Observed behavior**: The system prompt tells the LLM "There are no exceptions to this range," yet `Code in JavaScript5` defines `const WORD_TOLERANCE = 50;` and checks `articleWordCount < (MIN_WORDS - WORD_TOLERANCE) || articleWordCount > (MAX_WORDS + WORD_TOLERANCE)` — effectively accepting 50-250 words while telling the LLM 100-200 is a hard wall.
- **Risk**: The gate silently accepts articles 50 words outside its documented range, which (a) contradicts the "strict gate" framing given to editors reviewing rejections, and (b) hides real generation-quality problems (an LLM that's 40 words short is a problem worth surfacing, not silently passing).
- **Resolution**: No hidden tolerance. The default tolerance is **zero** — `bodyWordCount` must fall strictly within 100-200. If a tolerance is ever wanted, it must be an explicit, named, documented value in `validation-config.json` (e.g., `wordCountTolerance: 0`), never a bare constant inside validation logic.
- **Acceptance test**: An article with a paragraph-only word count of 95 or 205 fails OAT with an explicit "word count N outside required range 100-200" error; the validator config file shows `wordCountTolerance: 0` by default.
- **Maps to**: FR-028.

## R7. Parser calculates a word count but never returns or validates it

- **Observed behavior**: `Code in JavaScript1` computes `plainTextWordCount` from the rendered HTML, but the returned JSON object never includes it, and nothing downstream ever compares it to `parsed.bodyWordCount` (which is also never read).
- **Risk**: `bodyWordCount` (whatever value the LLM happened to report) is never checked against reality, so a model that mis-reports its own count (a common LLM failure mode) goes undetected all the way to publication.
- **Resolution**: `article-response-normalizer` calculates the paragraph-only word count itself and returns it as `bodyWordCount` (or a validation error if the LLM-reported value materially disagrees). `cmmc-oat-validator` independently recomputes and asserts equality per FR-028 rather than trusting either the LLM or the normalizer blindly.
- **Acceptance test**: Given an LLM response reporting `bodyWordCount: 150` but whose actual `p` blocks sum to 120 words, the normalized article's `bodyWordCount` is 120 (the calculated value), and OAT evaluates against 120.
- **Maps to**: FR-022, FR-028.

## R8. Diagnostic/debug objects can reach the WordPress publish node

- **Observed behavior**: When zero items pass OAT, `Code in JavaScript5` returns an array of `{ debug_failure: true, reason, title, content, post_content, categoryId, ... }` objects. These flow into `Limit` → `Loop Over Items` → the WordPress `HTTP Request` node with no filter/IF node in between checking for `debug_failure`. Because the debug object still has `title`, `content`, and `categoryId` keys, the WordPress payload template (`$json.title`, `$json.content`, `$json.categoryId`, `$json.dek`) would construct a real (if malformed) draft post from it.
- **Risk**: A batch where every candidate fails OAT can still result in a WordPress draft being created from debug/failure data — the opposite of the gate's purpose.
- **Resolution**: The reassembled workflow inserts an explicit structural check between OAT and publish: only objects shaped as a `PublicationRecord`-eligible `ValidationResult.normalizedArticle` (i.e., `oat_passed: true` and no `debug_failure` key) are routed to `wordpress-draft-publisher`; failing/diagnostic items are routed to `workflow-observability-reporter` only.
- **Acceptance test**: A run where every candidate fails OAT produces 0 WordPress HTTP requests and 1+ `oat_failed`/`skipped_duplicate` structured log entries per candidate.
- **Maps to**: FR-039.

## R9. Duplicate-detection caches update before WordPress confirms success

- **Observed behavior**: `Code in JavaScript5` (the OAT step) pushes to `staticData.postedUrls`, `postedTitles`, `postedContentHashes` and increments `oatPassedCount` immediately upon passing OAT — before the WordPress `HTTP Request` node is ever called.
- **Risk**: If the WordPress call subsequently fails (auth error, network error, validation error), the article is never actually published, yet the dedup cache now believes it was — permanently and silently blocking that headline/URL/content from ever being generated again.
- **Resolution**: Cache updates move to `publication-memory-updater`, which runs strictly after `wordpress-draft-publisher` returns a confirmed success response. OAT (`cmmc-oat-validator`) checks against existing caches but never writes to them.
- **Acceptance test**: Simulate a WordPress failure after a successful OAT pass; confirm `postedUrls`/`postedTitles`/`postedContentHashes`/`recentHeadlines` are unchanged after the run.
- **Maps to**: FR-035, FR-040.

## R10. Embedded Groq API key

- **Observed behavior**: `HTTP Request1`'s `Authorization` header hardcodes a live Groq API key (`Bearer gsk_[REDACTED]`, 51 characters, visible in `n8n/cmmc prompt development.json` line 43) directly in the exported workflow JSON.
- **Risk**: The key is exposed to anyone with repository access (including git history) and to anyone the exported JSON file is ever shared with. It must be treated as already compromised.
- **Resolution**: The key is never reproduced in any new file (skill docs, examples, tests, generated workflow). `llm-content-generator` reads its Groq credential from an n8n credential / environment variable only. The key must be revoked and replaced outside of this repository — tracked as a required action in `checklists/cmmc-workflow-security.md`, not something an automated task can perform.
- **Acceptance test**: Automated secret-scan of the generated workflow JSON, all skill docs, and all test fixtures finds zero matches for the `gsk_` prefix or any other credential-shaped string.
- **Maps to**: FR-046; security checklist.

## R11. Legacy "Federal Architect" branding in multi-perspective prompts

- **Observed behavior**: The `Code in JavaScript` node's `analysisPreamble` literally states "You are ... writing for staging-9980-federalarchitect.wpcomstaging.com," and the WordPress publish URL itself points at that staging domain.
- **Risk**: Newly generated content would self-identify under a legacy/incorrect brand, and the domain is hardcoded into reusable prompt-building logic rather than being a deployment-time configuration value.
- **Resolution**: `cmmc-editorial-prompt-builder` positions the publication as **"GovConIC — The Government Contractor Intelligence Center"** in all prompts, with no site domain embedded in prompt text at all (the domain is a `wordpress-draft-publisher` configuration value, never something the LLM is told to reference by name).
- **Acceptance test**: Grep the generated prompts and all skill docs for `federalarchitect` — zero matches.
- **Maps to**: FR-014.

## R12. Arbitrary unknown-block-type fallback produces guessed HTML

- **Observed behavior**: `blocksToHtml`'s `default:` case for an unrecognized block `type` sorts the block's own string-valued properties by length and heuristically renders the longest as a paragraph and the second-longest as a heading (if under 80 characters).
- **Risk**: Any block type the LLM invents (typo, hallucinated type, schema drift) silently renders as plausible-looking but semantically arbitrary HTML instead of failing loudly — the opposite of a strict content contract.
- **Resolution**: `article-blocks-to-html` rejects unknown block types by default, reporting a structural validation error. An explicit, configuration-gated fallback mode may exist for controlled degradation, but it is off by default and must have its own tests before use.
- **Acceptance test**: A body array containing a block with `type: "quote2"` (unsupported) fails block-to-HTML conversion with an explicit "unsupported block type" error when fallback mode is off, and is covered by a dedicated unit test when fallback mode is deliberately enabled.
- **Maps to**: FR-025.

## R13. Source extraction node disconnected from every live execution path

- **Observed behavior**: The `HTML` node (CSS-selector extraction of `title`/`content`) has **no incoming or outgoing connection anywhere in the workflow graph** — it is not reachable from `Schedule Trigger`, and nothing reads its output. `Code in JavaScript`'s `sourceArticle` extraction (`incoming.title`, `incoming.content`, etc.) therefore always resolves to empty strings in the live path, because its actual upstream node is `Schedule Trigger`, which carries no such fields.
- **Risk**: Multi-perspective mode's entire premise — analyzing a real source article — silently never has real source content to work with; the "analysis" is written against blank strings.
- **Resolution**: `source-content-extractor` is wired as an explicit, testable step ahead of `topic-angle-selector` in the reassembled workflow, with a defined contract (see `data-model.md`'s `SourceArticle`). When source-based generation is required (multi-perspective) and the extractor cannot produce a usable title/content, the workflow rejects that run rather than proceeding with blank context (FR-010).
- **Acceptance test**: With a valid HTML source and configured selectors, `source-content-extractor` returns non-empty `title`/`content`/`url`; with an empty/unreachable source, multi-perspective generation reports a clear rejection instead of emitting three blank-context requests.
- **Maps to**: FR-008, FR-009, FR-010.

---

## Additional defects found during analysis (beyond the required 13)

These were not on the required list but were discovered while tracing the actual node graph, and are resolved with the same rigor.

## R14. Multi-perspective batch loop never iterates past the first item

- **Observed behavior**: `Loop Over Items1` (the `splitInBatches` node that receives 1 or 3 items from `Code in JavaScript`) has its "loop" output wired to `Code in JavaScript2`, but **nothing in the workflow connects back to `Loop Over Items1`** to request its next batch. n8n's `splitInBatches` requires an explicit loop-back connection to advance past the first batch; without one, only the first of the 1-3 emitted items is ever processed.
- **Risk**: This silently defeats the entire multi-perspective feature — 3 generation requests are created, but only 1 (Executive, by array order) ever reaches generation, validation, or publication. The other two are lost with no error.
- **Resolution**: `n8n-workflow-assembler` wires the reassembled batch loop's body to explicitly loop back to its own `splitInBatches` node, and the acceptance test for User Story 3 (spec.md) specifically asserts all three perspectives complete.
- **Acceptance test**: Given 3 multi-perspective generation requests, all 3 are observed reaching the OAT/publish/reject stage (not just the first).
- **Maps to**: FR-011, FR-013.

## R15. Fragile node-name lookups couple stages together

- **Observed behavior**: `Code in JavaScript1` calls `$('Code in JavaScript2').item.json` to recover upstream data instead of receiving it through its own node's input; `Code in JavaScript3` similarly calls `$('Code in JavaScript1').item.json`.
- **Risk**: Renaming a node breaks the pipeline invisibly (no error until runtime); it also makes each "skill" impossible to test or reuse in isolation, since its logic implicitly depends on a specific upstream node's name existing in the same workflow.
- **Resolution**: Every skill contract defines its inputs/outputs explicitly (see `data-model.md`, `contracts/`); `n8n-workflow-assembler` passes data forward through normal node connections only. No `$('<node name>')` lookups are used in the reassembled workflow.
- **Acceptance test**: Static review of the generated workflow JSON's Code nodes finds zero `$('...')` node-name-lookup expressions.
- **Maps to**: FR-048.

## R16. Minor: Groq HTTP node content-type mismatch

- **Observed behavior**: `HTTP Request1` sets an explicit `Content-Type: application/json` header but also sets n8n's own `rawContentType` field to `"text/html"` while sending a JSON string body.
- **Risk**: Low — the explicit header may win in practice, but the mismatch is confusing and could behave differently across n8n versions.
- **Resolution**: `llm-content-generator`'s HTTP call configuration sets `rawContentType`/`Content-Type` consistently to `application/json`.
- **Acceptance test**: The generated workflow's LLM HTTP node has `rawContentType: application/json` and no conflicting header.
- **Maps to**: FR-017.

---

## Summary table

| ID | Issue | Canonical resolution | Primary FR(s) |
|----|-------|----------------------|----------------|
| R1 | 4 vs 8 paragraphs | Exactly 4 `p` blocks | FR-028 |
| R2 | 2 vs 2-3 h2 blocks | Exactly 2 `h2` blocks | FR-028 |
| R3 | Subtitle missing from schema | Subtitle is a required schema key | FR-021, FR-029 |
| R4 | Parser drops subtitle | Normalizer maps `subtitle` explicitly | FR-021 |
| R5 | 1,000-1,500 vs 100-200 words | 100-200 words (paragraph-only) | FR-028 |
| R6 | Hidden ±50 tolerance | Zero tolerance by default, config-only if changed | FR-028 |
| R7 | Word count computed, never validated | Normalizer + validator both compute and assert equality | FR-022, FR-028 |
| R8 | Debug objects reach publish | Explicit gate before publish; only validated articles pass | FR-039 |
| R9 | Dedup cache updates before publish confirmed | Cache updates only after confirmed publish | FR-035, FR-040 |
| R10 | Embedded Groq API key | Treated as compromised; never reproduced; credential-store only | FR-046 |
| R11 | Legacy Federal Architect branding | Rebranded to GovConIC in all prompts | FR-014 |
| R12 | Guessed HTML for unknown blocks | Reject by default; explicit tested fallback only | FR-025 |
| R13 | Source extraction disconnected | Explicitly wired skill with unusable-source rejection | FR-008–010 |
| R14 | Multi-perspective loop never advances | Explicit loop-back wiring; verified 3/3 completion | FR-011, FR-013 |
| R15 | Fragile node-name lookups | Explicit skill contracts; no `$('node')` lookups | FR-048 |
| R16 | Groq content-type mismatch | Consistent `application/json` | FR-017 |
