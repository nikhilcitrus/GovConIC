---
name: groq-interlinking
description: Generates internal-link suggestions for the article.
type: workflow-skill
source: n8n/GovConIC CMMC Updates Publisher.json
node: Groq Interlinking
---

# Groq Interlinking

## Purpose
Generates internal-link suggestions for the article.

## What this skill does
- Uses a second Groq prompt over the article body and candidate posts.
- Returns an array of recommended anchor and URL pairs.

## Inputs
- Workflow context from the preceding node(s)

## Outputs
- A structured result that can be passed to the next step in the workflow

## Notes
- Keep this skill aligned with the current workflow JSON and update it if the node logic changes.
