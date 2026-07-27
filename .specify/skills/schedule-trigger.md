---
name: schedule-trigger
description: Starts the GovConIC CMMC publishing workflow on a recurring cadence.
type: workflow-skill
source: n8n/GovConIC CMMC Updates Publisher.json
node: Schedule Trigger
---

# Schedule Trigger

## Purpose
Starts the GovConIC CMMC publishing workflow on a recurring cadence.

## What this skill does
- Runs every 6 hours.
- Acts as the entry point for the publishing pipeline.

## Inputs
- Workflow context from the preceding node(s)

## Outputs
- A structured result that can be passed to the next step in the workflow

## Notes
- Keep this skill aligned with the current workflow JSON and update it if the node logic changes.
