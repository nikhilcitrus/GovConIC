---
name: apply-internal-links
description: Injects the approved internal links into the article HTML.
type: workflow-skill
source: n8n/GovConIC CMMC Updates Publisher.json
node: Apply Internal Links
---

# Apply Internal Links

## Purpose
Injects the approved internal links into the article HTML.

## What this skill does
- Matches anchors in the article body.
- Rewrites matching phrases into anchor tags.

## Inputs
- Workflow context from the preceding node(s)

## Outputs
- A structured result that can be passed to the next step in the workflow

## Notes
- Keep this skill aligned with the current workflow JSON and update it if the node logic changes.
