# MCP Modular Slot Workflow Architecture

## Goal

This document defines the target architecture for the launcher's modular automation system.
The system is built around four independent workflow slots:

1. Input
2. Process
3. Create
4. Output

Each slot can run in one of two modes:

- `auto`: the launcher invokes an MCP block or Python worker automatically
- `manual`: the user completes the step in the UI and the launcher writes the result into the slot checkpoint JSON

This document intentionally standardizes the internal contract first.
The GUI should remain user-friendly and should not expose raw JSON unless explicitly requested in a developer context.

## Confirmed Product Decisions

The following decisions were explicitly confirmed:

- When a slot is OFF, the launcher should collect input through forms and file attachments, then save the result as internal JSON.
- Checkpoints should be stored per job under the package folder using `packages/<jobId>/checkpoint-1~4`.
- Slot 3 Create should evolve into a generic creation slot that can support TTS, image generation, video composition, and other future material-generation methods.

## Current Fit With Existing Launcher

The current shortform automation flow already maps loosely to the target model:

- Slot 1 Input: trend discovery
- Slot 2 Process: summary and script generation
- Slot 3 Create: production package generation
- Slot 4 Output: YouTube upload

However, the current implementation is still workflow-specific rather than a generic slot engine.
The immediate goal is not to rewrite everything at once, but to standardize checkpoint contracts and make the current workflow conform to them.

## Job Folder Layout

Each run should be represented by a single job directory.

```text
automation/
  jobs/
    <jobId>/
      job.json
      checkpoint-1/
        checkpoint.json
        attachments/
      checkpoint-2/
        checkpoint.json
        attachments/
      checkpoint-3/
        checkpoint.json
        attachments/
      checkpoint-4/
        checkpoint.json
        attachments/
      logs/
      exports/
```

## Core Principles

### 1. Checkpoint-first design

Every slot reads from the previous checkpoint and writes to its own checkpoint.
This allows:

- retries
- human review
- manual replacement
- alternate engines
- market-sold slot components

### 2. UI is not JSON

Users should see:

- forms
- drag-and-drop targets
- status cards
- validation errors
- previews

The launcher should translate those interactions into the checkpoint JSON behind the scenes.

### 3. Slot contracts are stable even if engines change

For example, Slot 3 Create might later be powered by:

- local Python pipelines
- cloud video APIs
- TTS services
- image generation providers
- template-based renderers

As long as the slot input and output contracts stay stable, the engine can change without breaking the launcher UX.

### 4. Manual and auto modes share one data model

The launcher should not maintain one structure for auto and another for manual.
Both modes should end by producing the same checkpoint JSON for the next slot.

## Slot Responsibilities

### Slot 1 Input

Collect and shortlist source material.

Examples:

- Reddit hot posts
- FMKorea hot posts
- RSS/news
- user-pasted ideas
- manually uploaded source notes

Primary output:

- a normalized set of content candidates

### Slot 2 Process

Turn a selected source into structured editorial material.

Examples:

- summary
- translation
- tone adjustment
- narration draft
- hook/title generation

Primary output:

- structured script package, not plain text only

### Slot 3 Create

Generate or assemble production assets.

Examples:

- TTS
- image generation
- subtitle generation
- video composition
- thumbnail generation
- provider-assisted rendering
- manual asset upload

Primary output:

- media asset bundle plus metadata

### Slot 4 Output

Publish or hand off the finished result.

Examples:

- YouTube upload
- TikTok upload
- Instagram upload
- export for manual upload

Primary output:

- publish request or publish result

## OFF Mode UX Rules

### Slot 1 OFF

The user should be able to:

- paste source URLs
- paste raw text
- upload reference files
- manually enter candidate metadata

The launcher should convert this into Slot 1 checkpoint JSON.

### Slot 2 OFF

The user should be able to:

- edit or paste summary
- edit hook
- edit narration
- edit CTA
- choose the selected candidate

The launcher should convert this into Slot 2 checkpoint JSON.

### Slot 3 OFF

The user should be able to:

- upload audio/video/image files
- select thumbnail
- enter caption/title/description
- choose which creation artifacts are already complete

The launcher should convert this into Slot 3 checkpoint JSON plus standardized attachment paths.

### Slot 4 OFF

The user should be able to:

- upload manually exported deliverables
- record published URL or platform video ID
- mark publish status
- save platform-specific notes

The launcher should convert this into Slot 4 checkpoint JSON.

## Recommended Migration Strategy

### Phase 1

Do not replace the current shortform workflow yet.
Instead:

- define standard checkpoint contracts
- write adapters from current services to those contracts
- store new checkpoint files alongside the existing package outputs

### Phase 2

Move the Installed workflow UI from service-specific assumptions toward slot cards:

- Slot 1 card
- Slot 2 card
- Slot 3 card
- Slot 4 card

Each card should support:

- ON/OFF
- Auto/Manual
- current status
- last output preview
- drag-and-drop/manual input

### Phase 3

Extract each slot engine into pluggable MCP/Python blocks while preserving the checkpoint contracts.

## Current Differences That Must Be Acknowledged

Compared with the requested target architecture, the current launcher differs in these ways:

1. It is still built around one shortform workflow rather than generic slot primitives.
2. Slot 1 and Slot 2 are not fully standardized as checkpoint contracts yet.
3. Slot 3 currently behaves more like package generation than a fully generic media creation engine.
4. Checkpoint folders should live under `packages/<jobId>/checkpoint-1~4` so each job stays inside one folder.
5. Manual mode is partially present in UX but is not yet formalized as a first-class slot execution mode.

These are implementation gaps, not conceptual blockers.

## Product Recommendation

The requested architecture is viable and fits the current launcher direction.
The safest next step is:

1. finalize checkpoint JSON schemas
2. add job folder layout
3. adapt the current shortform workflow to the schemas
4. then build true slot ON/OFF UI
