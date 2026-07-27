---
name: editorial-gate
description: Applies editorial quality rules before publishing.
type: workflow-skill
source: n8n/GovConIC CMMC Updates Publisher.json
node: Editorial Gate
---

# Editorial Gate

## Purpose
Applies editorial quality rules before publishing.

## What this skill does
- Checks headline options, word count, topical relevance, and promotional wording.
- Rejects low-quality or duplicate content.

## Inputs
- Workflow context from the preceding node(s)

## Outputs
- A structured result that can be passed to the next step in the workflow

## Notes
- Keep this skill aligned with the current workflow JSON and update it if the node logic changes.
