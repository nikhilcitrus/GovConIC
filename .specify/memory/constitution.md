<!--
Sync Impact Report
Version change: placeholder → 1.0.0
Modified principles:
- [PRINCIPLE_1_NAME] → I. Spec-First Delivery
- [PRINCIPLE_2_NAME] → II. Documented Planning
- [PRINCIPLE_3_NAME] → III. Task-Driven Execution
- [PRINCIPLE_4_NAME] → IV. Quality Discipline
- [PRINCIPLE_5_NAME] → V. Governed Change
Added sections:
- Additional Constraints
- Development Workflow
Removed sections: none
Templates requiring updates:
- ✅ .specify/templates/plan-template.md
- ⚠ .specify/templates/spec-template.md (no changes required)
- ⚠ .specify/templates/tasks-template.md (no changes required)
Follow-up TODOs: none
-->

# GovConic Workflows Constitution

## Core Principles

### I. Spec-First Delivery
All feature work begins with a written specification in `/specs/[###-feature-name]/spec.md`. Every implementation must trace back to a user story, acceptance criterion, or defined requirement. No production or planning work is accepted without an approved feature spec.

### II. Documented Planning
Technical decisions are captured in `plan.md` before task generation. Plans must state the language, dependencies, platform, constraints, and validation approach. This prevents hidden assumptions and keeps reviewers aligned with the implementation path.

### III. Task-Driven Execution
Work is expressed as discrete, dependency-ordered tasks in `tasks.md`, grouped by user story. Tasks must be independently understandable and implementation-ready. No source changes are considered complete unless corresponding tasks exist and are traceable to the spec.

### IV. Quality Discipline
Requirements must be measurable and acceptance criteria explicit. Every feature must include testable validation steps, and completed work must be supported by documentation, tests, or explicit review criteria. Reviews must verify that deliverables are verifiable and maintainable.

### V. Governed Change
Change to process, templates, or governance must be deliberate, documented, and versioned. Amendments require rationale, review, and synchronization of `.specify/templates/` and workflow guidance to preserve consistency across the repository.

## Additional Constraints
The `.specify/` directory is the authoritative source for workflow templates, command behavior, and governance. Feature branches must follow Spec Kit conventions and use `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, and `/speckit-implement` in sequence. Repository metadata such as `.specify/init-options.json` and workflow manifests are part of the governance boundary.

## Development Workflow
Spec → Plan → Tasks → Implement is the required workflow for all feature work. Every feature starts with a spec, then advances through an implementation plan, explicit tasks, and finally execution. Reviews must confirm alignment with constitution principles before merge. Template or process changes must preserve backward compatibility and update the corresponding guidance.

## Governance
This constitution is the single source of workflow governance for the repository. Amendments require:
- a clear rationale for the change,
- an explicit version bump following the versioning policy below,
- review by the repository maintainers,
- and updates to any affected templates or guidance.

Versioning policy:
- MAJOR when principles or governance definitions are removed or redefined in a backward-incompatible way.
- MINOR when a new principle, section, or material governance constraint is added.
- PATCH for clarifications, wording improvements, and non-semantic refinements.

Compliance expectations:
- All PRs touching feature docs, workflow templates, or process guidance must reference the constitution.
- Reviewers must verify that specs, plans, and tasks reflect the current principles and that no placeholder tokens remain unintentionally present.
- Any intentionally deferred placeholder must be marked as `TODO(<FIELD_NAME>): explanation`.

**Version**: 1.0.0 | **Ratified**: 2026-07-27 | **Last Amended**: 2026-07-27
