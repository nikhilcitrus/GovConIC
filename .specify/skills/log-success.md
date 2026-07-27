---
name: log-success
description: Records a successful publication event.
type: workflow-skill
source: n8n/GovConIC CMMC Updates Publisher.json
node: Log Success
---

# Log Success

## Purpose
Records a successful publication event.

## What this skill does
- Creates a simple success payload with the post title.
- Useful for workflow monitoring and audit trails.

## Inputs
- Workflow context from the preceding node(s)

## Outputs
- A structured result that can be passed to the next step in the workflow

## Notes
- Keep this skill aligned with the current workflow JSON and update it if the node logic changes.
