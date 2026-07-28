# Implementation Plan: CMMC Content Publishing Workflow Governance

**Branch**: `001-workflow-governance` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-workflow-governance/spec.md`, contradiction resolutions from `research.md`, entity contracts from `data-model.md` and `contracts/`.

## Summary

Replace the source n8n workflow `n8n/cmmc prompt development.json` with a governed reimplementation where every specialized capability (context/memory, topic selection, source extraction, multi-perspective planning, prompt building, LLM generation, response normalization, block-to-HTML conversion, OAT validation, publication, memory update, observability, and workflow assembly itself) is documented as an independent, reusable Spec Kit skill under `.specify/skills/`. n8n remains the sole execution runtime — skills are the contract-and-documentation layer that n8n Code/HTTP/branching nodes implement against, not a separate runtime. The 16 contradictions and defects catalogued in `research.md` are each resolved once, at the skill-contract level, so the same ambiguity cannot silently reappear in the reassembled workflow.

## Technical Context

**Language/Version**: JavaScript (Node.js runtime embedded in n8n Code nodes, n8n-managed version); skill documentation and configuration in Markdown + JSON.

**Primary Dependencies**: n8n (workflow runtime), Groq OpenAI-compatible Chat Completions API (initial LLM provider, adapter-based), WordPress REST API (`/wp-json/wp/v2/posts`), Node's built-in `assert`/test runner for unit tests (no new runtime dependency introduced solely for testing skill logic — see `plan.md#testing` below).

**Storage**: n8n workflow static data (`$getWorkflowStaticData('global')`) is the default `WorkflowMemory` adapter for this iteration, behind the storage-adapter interface defined in `publication-memory-updater/SKILL.md`, so a future move to a database or file store does not require changing any other skill.

**Testing**: Plain Node.js scripts (`node --test` or hand-rolled assertion scripts) under each skill's `tests/` directory, runnable without installing new dependencies into this repository. Schema validation is checked structurally against the JSON Schemas in `contracts/` and each skill's `schemas/`.

**Target Platform**: n8n instance (cloud or self-hosted) executing the assembled workflow; WordPress staging/production site as the publish target.

**Project Type**: Workflow automation + reusable documentation/skill library (not a standalone application or service).

**Performance Goals**: Not throughput-sensitive — this is a scheduled, low-frequency (every few minutes, batch size 1-3) content pipeline. The only hard timing constraint is the configurable LLM call timeout (FR-017) and retry budget, not overall throughput.

**Constraints**:
- Must never publish anything other than a WordPress `draft` (FR-036).
- Must never write to duplicate-detection or memory caches before a WordPress publish is confirmed (FR-035, FR-040).
- Must never let a diagnostic/debug object reach the publish step (FR-039).
- Must never contain a credential value in any source-controlled file (FR-046).
- Generated n8n workflow JSON must remain `active: false` (task constraint; never auto-activated).

**Scale/Scope**: 13 reusable skills, 1 orchestration manifest, 1 assembled n8n workflow, ~6 configuration files, 3 integration docs, 1 security checklist, unit/contract/integration/acceptance tests per skill.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (this plan).*

- **Spec-First Delivery**: `spec.md` exists, is in Draft status pending review, and every requirement below traces to an FR or a research.md resolution. ✅
- **Documented Planning**: This plan states language, dependencies, storage, testing approach, constraints, and validation strategy before any task generation. ✅
- **Task-Driven Execution**: `tasks.md` (Phase 4, not yet created) will express every skill/workflow/test file as a discrete, dependency-ordered, user-story-traceable task. Not yet satisfied — gate re-checked after `tasks.md` is written.
- **Quality Discipline**: Every FR has an explicit acceptance scenario (spec.md) or acceptance test (research.md); `contracts/` gives measurable, machine-checkable shapes for every cross-skill boundary. ✅
- **Governed Change**: All 16 known contradictions are documented with rationale in `research.md` rather than silently resolved; this plan and `.specify/` structure are additive to (not replacing) the existing Spec Kit installation. ✅

No violations requiring a Complexity Tracking entry — the 13-skill decomposition is a direct requirement of the task, not an unjustified architectural complexity increase (see rationale in Project Structure below).

## Project Structure

### Documentation (this feature)

```text
specs/001-workflow-governance/
├── spec.md              # Phase 2 output — this file's sibling
├── research.md           # Phase 3 output — contradiction-by-contradiction resolution
├── data-model.md         # Phase 3 output — entity contracts shared by all skills
├── contracts/            # Phase 3 output — JSON Schemas for every cross-skill boundary
│   ├── article.schema.json
│   ├── llm-request.schema.json
│   ├── llm-response.schema.json
│   ├── wordpress-request.schema.json
│   ├── wordpress-response.schema.json
│   └── workflow-manifest.schema.json
├── quickstart.md         # Phase 8 output — setup, import, dry-run, rollback guidance
├── plan.md               # This file
└── tasks.md              # Phase 4 output — dependency-ordered implementation tasks
```

### Source structure (repository root)

This feature is not a conventional application; "source" is a skill-and-configuration library consumed by n8n plus the assembled workflow itself. There is no `src/` — the equivalent decomposition is:

```text
.specify/
├── skills/                                   # Reusable capability documentation + logic (Phase 5)
│   ├── workflow-context-manager/
│   ├── topic-angle-selector/
│   ├── source-content-extractor/
│   ├── multi-perspective-planner/
│   ├── cmmc-editorial-prompt-builder/
│   ├── llm-content-generator/
│   ├── article-response-normalizer/
│   ├── article-blocks-to-html/
│   ├── cmmc-oat-validator/
│   ├── wordpress-draft-publisher/
│   ├── publication-memory-updater/
│   ├── workflow-observability-reporter/
│   └── n8n-workflow-assembler/
│       # each contains SKILL.md, schemas/, examples/, scripts/, tests/ as needed
├── integrations/                             # Phase 5/8 — per-provider docs (Groq, WordPress, n8n)
│   ├── groq/
│   ├── wordpress/
│   └── n8n/
└── workflows/
    └── cmmc-content-publishing/
        ├── workflow.md                       # Human-readable orchestration definition
        ├── workflow.json                      # Machine-readable manifest (validates against
        │                                       #   contracts/workflow-manifest.schema.json)
        └── config/
            ├── editorial-config.json
            ├── validation-config.json
            └── provider-config.json

n8n/
├── cmmc prompt development.json              # Original source workflow — left as-is (contains
│                                               #   the compromised key; NOT edited in place)
├── source/
│   └── cmmc-prompt-development.original.json  # Cleaned reference copy: secrets scrubbed,
│                                               #   structure preserved, for historical comparison
└── generated/
    └── govconic-cmmc-content-publishing.json  # Import-ready, secret-free, inactive workflow

tests/
├── unit/            # Per-skill logic tests (format rotation, HTML escaping, word counts, etc.)
├── contract/         # Validates payloads against contracts/*.schema.json
└── integration/      # Mocked Groq/WordPress interaction tests

.env.example          # Placeholder-only environment variable template
checklists/
└── cmmc-workflow-security.md
```

**Structure Decision**: 13 independent skills (one per capability in spec.md's Reusability and Governance requirements, FR-047) rather than one large workflow-logic module, because (a) the task requires each capability to be independently reusable and testable, (b) the source workflow's single-large-Code-node design is precisely the anti-pattern being corrected (research.md R15), and (c) n8n's node model already expects small, composable units — the skill boundary maps directly onto a node or small node group, keeping `n8n-workflow-assembler`'s job mechanical rather than another place logic could hide.

## Complexity Tracking

*No entries — the Constitution Check above found no violations requiring justification.*
