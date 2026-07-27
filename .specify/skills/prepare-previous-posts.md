---
name: prepare-previous-posts
description: Normalizes previous-post data into a consistent structure.
type: workflow-skill
source: n8n/GovConIC CMMC Updates Publisher.json
node: Prepare Previous Posts
---

# Prepare Previous Posts

## Purpose
Normalizes previous-post data into a consistent structure.

## What this skill does
- Converts response formats into a reusable list.
- Prepares the data for editorial gate evaluation.

## Inputs
- Workflow context from the preceding node(s)

## Outputs
- A structured result that can be passed to the next step in the workflow

## Notes
- Keep this skill aligned with the current workflow JSON and update it if the node logic changes.
