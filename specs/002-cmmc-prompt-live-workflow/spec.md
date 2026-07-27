# Feature Specification: GovConIC CMMC Updates Publisher Workflow

**Feature Branch**: `002-cmmc-prompt-live-workflow`

**Created**: 2026-07-27

**Status**: Draft

**Input**: Rebuild the existing n8n workflow as a secure, importable workflow export that schedules article generation, validates JSON output, and publishes WordPress drafts using environment-based credentials.

## User Scenarios & Testing

### User Story 1 - Run the content pipeline on a schedule (Priority: P1)
As a publisher, I want the workflow to run automatically on a schedule so fresh CMMC-related drafts are generated without manual intervention.

**Independent Test**: The workflow can be activated and successfully generate one or more draft items from a configured source URL.

### User Story 2 - Produce structured drafts and validate them (Priority: P2)
As an editor, I want generated drafts to follow a strict schema and fail loudly when validation errors occur so low-quality output is rejected.

### User Story 3 - Publish drafts securely to WordPress (Priority: P2)
As a site operator, I want each validated draft to be published as a draft post to WordPress using secure authentication so it can be reviewed before public release.

## Requirements
- FR-001: The workflow MUST run on a configurable schedule and process source articles from configured URLs.
- FR-002: The workflow MUST extract a title and main body content using HTML selectors and regex-based extraction.
- FR-003: The workflow MUST rotate through the specified lead angles and article formats, including a multi-perspective variant that fans out into three tailored perspectives.
- FR-004: The workflow MUST send a prompt to a chat-completions API with a strict schema and validate the response before publishing.
- FR-005: The workflow MUST retry failed LLM requests up to three times with a five-second backoff.
- FR-006: The workflow MUST publish each accepted draft as a WordPress draft post using secure authentication and never auto-publish.
- FR-007: The workflow MUST persist recent headline and follow-on-idea state across runs using workflow static data.
- FR-008: The workflow MUST support a configurable maximum number of items processed per run.

## Success Criteria
- SC-001: The workflow imports into n8n without syntax errors.
- SC-002: The workflow can generate and validate a structured draft from a valid source article.
- SC-003: Every accepted draft is published as a WordPress draft, not a live post.
- SC-004: The workflow persists recent topics across runs to avoid repetition.
