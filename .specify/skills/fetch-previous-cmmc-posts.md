---
name: fetch-previous-cmmc-posts
description: Retrieves recent CMMC-related posts from the GovConIC WordPress site.
type: workflow-skill
source: n8n/GovConIC CMMC Updates Publisher.json
node: Fetch Previous CMMC Posts
---

# Fetch Previous CMMC Posts

## Purpose
Retrieves recent CMMC-related posts from the GovConIC WordPress site.

## What this skill does
- Calls the WordPress REST API.
- Provides prior content for duplicate and overlap checks.

## Inputs
- Workflow context from the preceding node(s)

## Outputs
- A structured result that can be passed to the next step in the workflow

## Notes
- Keep this skill aligned with the current workflow JSON and update it if the node logic changes.
