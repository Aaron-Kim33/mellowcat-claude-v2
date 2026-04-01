# YouTube Material Generator MCP

## Goal
- Slot 3 (`create`) should generate a publishable shortform video package with minimal AI usage.
- AI is used only to convert the approved Slot 2 script into a timed `scene-plan.json`.
- Asset search, clipping, subtitle generation, dubbing assembly, and final composition should be code/tool-driven.

## Recommended pipeline
1. Read Slot 2 output (`script_draft_v1`)
2. Generate `scene-plan.json`
3. Search scene assets by keyword with providers such as Pexels
4. Select and trim scene assets to match each scene duration
5. Generate Korean voice-over audio
6. Generate subtitle cues from the same timed scene plan
7. Compose final video with FFmpeg
8. Save outputs into `checkpoint-3`

## AI boundary
- AI should only do:
  - scene segmentation
  - duration planning
  - English keyword extraction
- AI should not do:
  - video retrieval
  - asset download
  - clipping
  - subtitle muxing
  - final render

## Scene plan prompt intent
- Split the source narration into independent scenes
- Each scene should target:
  - 15 to 20 words
  - about 30 to 40 Korean characters
- Total duration must remain under 60 seconds
- Scene count should be flexible based on source density
- At least 3 scenes should be encouraged
- Each scene needs:
  - `startSec`
  - `endSec`
  - Korean spoken text
  - 2 to 3 English keywords

## Input contract
- Primary contract: `script_draft_v1`
- Optional enrichments:
  - approved headline
  - summary
  - hook
  - CTA

## Internal artifact contract
- `scene-plan.json`
- `asset-manifest.json`
- `voiceover.wav` or `voiceover.mp3`
- `captions.srt`
- `final-video.mp4`
- optional `thumbnail.png`

## Checkpoint-3 output expectation
- `checkpoint-3/checkpoint.json`
  - points to final generated package metadata
- package folder should contain:
  - `scene-plan.json`
  - `asset-manifest.json`
  - `voiceover.*`
  - `captions.srt`
  - `final-video.mp4`
  - optional `thumbnail.png`

## Tooling recommendation
- Asset search/download:
  - Pexels API
- Korean dubbing:
  - Azure AI Speech is recommended first for Korean TTS quality and SSML control
  - OpenAI TTS can be a fallback for MVP
- Video composition:
  - FFmpeg
- Subtitle file:
  - generate directly from scene timing rather than STT re-transcription

## Runtime contract direction
- Suggested MCP id:
  - `youtube-material-generator-mcp`
- Suggested slot:
  - `create`
- Suggested category:
  - `packaging`
- Suggested contracts:
  - input: `script_draft_v1`
  - output: `production_package_v1`
  - internal artifact: `scene_plan_v1`

## Why this fits the current launcher
- Matches the 4-slot pipeline without introducing a heavy node-editor model
- Keeps Slot 3 as a real composable MCP
- Preserves the checkpoint philosophy:
  - users can inspect and replace intermediate artifacts if needed
