---
name: parse-groq-response
description: Parses and normalizes the LLM output into article fields and HTML.
type: workflow-skill
source: n8n/GovConIC CMMC Updates Publisher.json
node: Parse Groq Response
---

# Parse Groq Response

## Purpose
Parses and normalizes the LLM output into article fields and HTML.

## What this skill does
- Extracts JSON when present.
- Converts content blocks into an HTML body.
- Calculates the article word count for downstream validation.

## Inputs
- Workflow context from the preceding node(s)

## Outputs
- A structured result that can be passed to the next step in the workflow

## Notes
- Keep this skill aligned with the current workflow JSON and update it if the node logic changes.
