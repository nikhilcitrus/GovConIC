---
name: create-wordpress-post
description: Publishes the article as a WordPress post.
type: workflow-skill
source: n8n/GovConIC CMMC Updates Publisher.json
node: Create WordPress Post
---

# Create WordPress Post

## Purpose
Publishes the article as a WordPress post.

## What this skill does
- Posts to the WordPress REST endpoint.
- Sets the post status to publish and assigns the CMMC category.

## Inputs
- Workflow context from the preceding node(s)

## Outputs
- A structured result that can be passed to the next step in the workflow

## Notes
- Keep this skill aligned with the current workflow JSON and update it if the node logic changes.
