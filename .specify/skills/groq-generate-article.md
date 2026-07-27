---
name: groq-generate-article
description: Generates a structured article draft using the Groq LLM.
type: workflow-skill
source: n8n/GovConIC CMMC Updates Publisher.json
node: Groq Generate Article
---

# Groq Generate Article

## Purpose
Generates a structured article draft using the Groq LLM.

## What this skill does
- Uses the Groq chat-completions endpoint.
- Builds a prompt around the selected CMMC topic and source URL.
- Expects a JSON payload with title, headlineOptions, and 11 content blocks.

## Inputs
- Workflow context from the preceding node(s)

## Outputs
- A structured result that can be passed to the next step in the workflow

## Notes
- Keep this skill aligned with the current workflow JSON and update it if the node logic changes.
