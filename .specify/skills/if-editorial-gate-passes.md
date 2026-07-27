---
name: if-editorial-gate-passes
description: Branches the workflow based on the editorial gate result.
type: workflow-skill
source: n8n/GovConIC CMMC Updates Publisher.json
node: If Editorial Gate Passes
---

# If Editorial Gate Passes

## Purpose
Branches the workflow based on the editorial gate result.

## What this skill does
- Sends approved content through the publication path.
- Routes rejected content into the skip log.

## Inputs
- Workflow context from the preceding node(s)

## Outputs
- A structured result that can be passed to the next step in the workflow

## Notes
- Keep this skill aligned with the current workflow JSON and update it if the node logic changes.
