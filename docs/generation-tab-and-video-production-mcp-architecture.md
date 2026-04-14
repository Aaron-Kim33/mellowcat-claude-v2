# Generation Tab + Video Production MCP Architecture

## Goal

Design a launcher-native creation workflow that supports:

1. script planning
2. human editing before API costs
3. asset generation
4. final video composition
5. publish handoff

while keeping the current 4-slot checkpoint architecture.

## Product Direction

Keep internal slots unchanged:

- Slot 1: Input
- Slot 2: Process
- Slot 3: Create
- Slot 4: Output

Add a new `Generation` tab as an editing control plane between Slot 2 and Slot 3.

The Generation tab does not replace slots.
It manages scene-level design data consumed by Slot 3 MCPs.

## Key Principle

Do not implement Flux + ElevenLabs + Remotion as one giant MCP.

Split responsibilities so each block is replaceable:

1. `script-scene-planner-mcp`
2. `asset-generator-mcp`
3. `video-composer-mcp`

This keeps cost control, retry behavior, and Lego-style module replacement clean.

## Pipeline (Recommended)

1. Slot 1 collects candidates
2. Slot 2 creates approved narrative draft
3. Generation tab creates/edits `scene-script.json`
4. Slot 3 runs `asset-generator-mcp`:
   - Flux image generation
   - ElevenLabs voice generation with timestamps
5. Slot 3 runs `video-composer-mcp`:
   - Remotion render
   - hard-burn subtitle style
6. Slot 4 uploads to selected destination

## Data Contract: `scene_script_v1`

This is the central editable JSON in the Generation tab.

```json
{
  "schemaVersion": 1,
  "jobId": "job-20260410-001122",
  "language": "ko",
  "category": "horror",
  "targetDurationSec": 58,
  "scenes": [
    {
      "sceneNo": 1,
      "text": "돈을 준다면 인종을 바꿔주겠다는 제안, 너라면 받을래?",
      "fluxPrompt": "cinematic close-up ...",
      "motion": "zoom-in",
      "durationSec": 8
    }
  ],
  "subtitleStyle": {
    "mode": "outline",
    "fontFamily": "Gmarket Sans",
    "fontSize": 60,
    "outline": 4,
    "color": "#ffffff",
    "outlineColor": "#000000"
  },
  "voiceProfile": {
    "provider": "elevenlabs",
    "voiceId": "pNInz6OBsSjW",
    "modelId": "eleven_multilingual_v2",
    "stability": 0.45,
    "similarityBoost": 0.75,
    "style": 0.06,
    "useSpeakerBoost": true
  }
}
```

## Data Contract: `asset_manifest_v2` (Create Output)

```json
{
  "schemaVersion": 2,
  "jobId": "job-20260410-001122",
  "sceneScriptPath": "scene-script.json",
  "assets": [
    {
      "sceneNo": 1,
      "imagePath": "assets/scene-01.png",
      "audioPath": "assets/scene-01.mp3",
      "wordTimestampsPath": "assets/scene-01.words.json"
    }
  ],
  "voiceoverPath": "voiceover.mp3",
  "captionPath": "captions.ass",
  "status": "ready"
}
```

## Generation Tab UX (MVP)

Top actions:

- `Generate scene draft`
- `Save draft`
- `Generate selected scene only`
- `Generate all assets`
- `Render final video`

Main editor panels:

1. Scene list
2. Scene editor
   - text
   - flux prompt
   - duration
   - motion
3. Voice profile
4. Subtitle style
5. Render preview/status

## Cost-Control Workflow

Enforce this order:

1. generate editable scene draft
2. user edits scene JSON in Generation tab
3. only then call paid media APIs

No asset API call should run before user approval in the Generation tab.

## Partial Regeneration Strategy

Use scene-level file naming:

- `scene-01.png`
- `scene-01.mp3`
- `scene-01.words.json`

If only scene 2 changes:

- regenerate scene 2 assets only
- reuse scenes 1, 3, 4, 5
- rerender final composition using mixed reused+new assets

This is required to minimize API costs.

## MCP Roles

### `script-scene-planner-mcp`

- slot: `process` or generation-tab tool MCP
- input: `script_draft_v1`
- output: `scene_script_v1`
- AI-heavy text planning only

### `asset-generator-mcp`

- slot: `create`
- input: `scene_script_v1`
- output: `asset_manifest_v2`
- calls Flux + ElevenLabs
- must request word timestamps

### `video-composer-mcp`

- slot: `create`
- input: `asset_manifest_v2`
- output: `production_package_v1`
- Remotion render and final file assembly

## Remotion Requirements

Composition must support:

1. background layer (Ken Burns style motion)
2. audio layer (scene and/or merged narration)
3. dynamic subtitle layer (word-timestamp aware)

Provide a template registry so style variants can be swapped without changing upstream contracts.

## Guardrails

1. Create execution must require Slot 2 approval + Generation approval.
2. If scene draft is invalid JSON, block paid API calls.
3. If ElevenLabs timestamp data is missing, block subtitle-sync render mode.
4. If final render fails, preserve per-scene generated assets for retry.

## Compatibility With Current Launcher

This design fits the current launcher because:

- checkpoints already exist per slot
- Slot 3 already supports multiple MCPs
- manual/auto gate logic already exists
- Telegram control can continue for approvals and run triggers

## Phased Rollout

### Phase 1

- add `scene_script_v1` type + persistence
- add Generation tab read/write UI
- no external API calls yet

### Phase 2

- implement `asset-generator-mcp` for Flux + ElevenLabs
- support single-scene regeneration

### Phase 3

- implement `video-composer-mcp` with Remotion
- final render and handoff to Slot 4

### Phase 4

- add template packs for subtitle and motion styles
- add provider alternatives without changing contracts
