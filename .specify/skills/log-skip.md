---
name: log-skip
description: Records when the editorial gate prevents publication.
type: workflow-skill
source: n8n/GovConIC CMMC Updates Publisher.json
node: Log Skip
---

# Log Skip

## Purpose
Records when the editorial gate prevents publication.

## What this skill does
- Captures the skip reason for later review.
- Provides a lightweight audit trail of rejected content.

## Inputs
- Workflow context from the preceding node(s)

## Outputs
- A structured result that can be passed to the next step in the workflow

## Notes
- Keep this skill aligned with the current workflow JSON and update it if the node logic changes.
