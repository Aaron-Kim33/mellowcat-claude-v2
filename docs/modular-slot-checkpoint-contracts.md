# Modular Slot Checkpoint Contracts

## Purpose

This document defines the internal JSON contracts for the four-slot workflow system.
These are internal launcher contracts.
The GUI should map forms and files into these structures.

## Shared Envelope

Every checkpoint should follow this base structure.

```json
{
  "schemaVersion": 1,
  "jobId": "job_20260330_001",
  "slot": "input",
  "mode": "auto",
  "status": "completed",
  "createdAt": "2026-03-30T12:00:00.000Z",
  "updatedAt": "2026-03-30T12:05:00.000Z",
  "sourceCheckpoint": null,
  "attachments": [],
  "payload": {}
}
```

Rules:

- `slot`: `input` | `process` | `create` | `output`
- `mode`: `auto` | `manual`
- `status`: `idle` | `ready` | `running` | `awaiting_input` | `completed` | `error`

## Slot 1 Checkpoint

### Purpose

Normalized candidate intake.

### Payload

```json
{
  "request": {
    "regions": ["global", "domestic"],
    "limit": 4,
    "timeWindow": "24h"
  },
  "selectedCandidateId": "candidate_2",
  "candidates": [
    {
      "id": "candidate_2",
      "title": "Candidate title",
      "summary": "Short summary",
      "operatorSummary": "Operator-facing explanation",
      "contentAngle": "Debate framing",
      "media": {
        "hasMedia": true,
        "imageUrls": ["https://..."],
        "analysisPolicy": "text_only"
      },
      "sourceKind": "reddit",
      "sourceRegion": "global",
      "sourceLabel": "Reddit",
      "sourceUrl": "https://...",
      "score": 88,
      "metrics": {
        "upvotes": 1200,
        "comments": 300
      },
      "fitReason": "Why it fits the workflow"
    }
  ],
  "sourceDebug": []
}
```

### Manual UI Mapping

If Slot 1 is OFF, the launcher should provide:

- source URL fields
- source text textarea
- candidate list editor
- optional file attachment area

Then save the resulting normalized candidates into this payload.

## Slot 2 Checkpoint

### Purpose

Editorial processing result.

### Payload

```json
{
  "selectedCandidateId": "candidate_2",
  "summary": {
    "headline": "One-line topic summary",
    "body": "Longer structured summary",
    "language": "ko"
  },
  "scriptDraft": {
    "titleOptions": ["Title A", "Title B"],
    "hook": "Opening hook",
    "narration": "Narration body",
    "callToAction": "CTA"
  },
  "review": {
    "status": "approved",
    "notes": ""
  }
}
```

### Recommendation

Current plain text should not remain the long-term internal contract.
The launcher may still show simple text fields in the GUI, but the stored checkpoint should be structured JSON like this.

## Slot 3 Checkpoint

### Purpose

Creation asset bundle.

### Payload

```json
{
  "assetPlan": {
    "ttsRequired": true,
    "imageGenerationRequired": true,
    "videoCompositionRequired": true,
    "thumbnailRequired": true
  },
  "assets": {
    "audio": [
      {
        "label": "main-narration",
        "path": "attachments/audio/main-narration.mp3",
        "status": "ready"
      }
    ],
    "images": [
      {
        "label": "scene-1",
        "path": "attachments/images/scene-1.png",
        "status": "ready"
      }
    ],
    "video": [
      {
        "label": "final-cut",
        "path": "attachments/video/final-cut.mp4",
        "status": "ready"
      }
    ],
    "thumbnail": {
      "path": "attachments/thumbnail/thumb.png",
      "status": "ready"
    }
  },
  "metadata": {
    "title": "Upload title",
    "description": "Upload description",
    "hashtags": ["#tag1", "#tag2"]
  }
}
```

### Important Note

Slot 3 must stay provider-agnostic.
It should support:

- API-based generation
- local Python generation
- manual file upload
- future non-video creation methods

## Slot 4 Checkpoint

### Purpose

Publishing request or publish result.

### Payload

```json
{
  "platform": "youtube",
  "publishMode": "auto",
  "request": {
    "videoFilePath": "attachments/video/final-cut.mp4",
    "thumbnailFilePath": "attachments/thumbnail/thumb.png",
    "scheduledPublishAt": "2026-03-30T16:00:00.000Z",
    "metadata": {
      "title": "Upload title",
      "description": "Upload description",
      "tags": ["tag1", "tag2"],
      "categoryId": "22",
      "privacyStatus": "private",
      "selfDeclaredMadeForKids": false
    }
  },
  "result": {
    "status": "pending",
    "videoId": null,
    "videoUrl": null,
    "message": ""
  }
}
```

### Current Compatibility

The existing `youtube-upload-request.json` can be treated as the first adapter target for this checkpoint.

## Checkpoint File Examples

Recommended storage:

```text
jobs/<jobId>/checkpoint-1/checkpoint.json
jobs/<jobId>/checkpoint-2/checkpoint.json
jobs/<jobId>/checkpoint-3/checkpoint.json
jobs/<jobId>/checkpoint-4/checkpoint.json
```

Attachments should live inside the same checkpoint folder to make jobs portable and auditable.

## Mapping From Current Workflow

### Current -> Slot 1

- `TrendDiscoveryResult`
- `TrendCandidate[]`

### Current -> Slot 2

- summary text
- `ShortformScriptDraft`

### Current -> Slot 3

- `script.json`
- `upload-metadata.json`
- generated text assets
- selected media file paths

### Current -> Slot 4

- `youtube-upload-request.json`
- `youtube-upload-result.json`

## Recommended Immediate Implementation Step

Before building full slot ON/OFF UI, add a thin adapter layer that writes these checkpoint files for the current shortform workflow.
That will let the launcher evolve safely without breaking the existing flow.
