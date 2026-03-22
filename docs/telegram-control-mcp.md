# Telegram Control MCP

## Purpose

`telegram-control-mcp` is the first control surface for the MellowCat shortform automation product.

The goal is not to fully automate publishing on day one. The goal is to let a user manage the content pipeline from a messenger:

- receive trend candidates
- choose a topic
- review generated scripts
- approve, request revision, or reject
- receive a production package for manual editing or upload

This MCP is the operator-facing layer of the product.

## Why Telegram First

- easy bot API integration
- stable webhook and polling options
- buttons and callbacks are simple
- good fit for rapid MVP validation

KakaoTalk remains important for the Korean market, but Telegram is the lower-risk path to validate the workflow first.

## Product Positioning

The product being sold is:

`messenger-based shortform operations system`

Not:

- a raw Claude launcher
- a fully autonomous uploader
- a one-shot video generator

The launcher is the delivery platform. The sellable value is the automation flow.

## Core Flow

1. `trend-discovery-mcp` collects candidate topics
2. `telegram-control-mcp` sends a ranked shortlist to the user
3. user selects one topic from Telegram
4. `shortform-script-mcp` generates Koreanized shortform copy
5. `telegram-control-mcp` sends the draft for approval
6. user approves, requests revision, or rejects
7. `asset-packager-mcp` produces a production package
8. user receives the final package and edits/uploads manually

## MVP Scope

### In

- send Telegram messages
- send inline buttons
- capture button callbacks
- capture free-text revision requests
- keep per-chat job state
- resume pending approvals after app restart
- basic audit trail in local logs

### Out

- multi-user team routing
- role permissions
- auto publishing to social platforms
- billing enforcement
- KakaoTalk integration

## Main User Actions

- `Pick Topic`
- `Generate Script`
- `Approve`
- `Request Revision`
- `Reject`
- `Build Package`
- `Archive Job`

## Conversation Model

Each Telegram chat controls a single queue of content jobs.

Each job moves through these stages:

`discovered -> shortlisted -> selected -> scripting -> awaiting_review -> approved -> packaging -> ready -> archived`

Possible failure states:

`failed_discovery`, `failed_scripting`, `failed_packaging`

## Telegram Message Types

### 1. Trend Shortlist

Sent after discovery completes.

Example shape:

```text
Today's shortform candidates

1. US TikTok trend about ...
2. Viral Reddit story about ...
3. YouTube Shorts format around ...

Reply with a number or tap a button.
```

Buttons:

- `Select 1`
- `Select 2`
- `Select 3`
- `Refresh`

### 2. Script Review

Sent after script generation completes.

Contents:

- Korean title candidates
- first 3-second hook
- short narration draft
- CTA

Buttons:

- `Approve`
- `Revise`
- `Reject`

### 3. Revision Request Prompt

Sent only after `Revise`.

Example:

```text
Tell me what to change.
Example: make it more aggressive, shorten the intro, target Korean office workers.
```

### 4. Production Package Ready

Sent after packaging completes.

Contents:

- summary
- output folder path
- included assets list

Buttons:

- `Open Next Job`
- `Archive`

## MCP Boundaries

### telegram-control-mcp owns

- Telegram bot token usage
- chat routing
- callback handling
- job stage transitions triggered by human input
- notification formatting

### telegram-control-mcp does not own

- trend scraping logic
- script writing logic
- video generation logic
- upload logic

It orchestrates other MCPs, but should not become a giant all-in-one service.

## Suggested Local Interfaces

### Input from other MCPs

```ts
interface TrendCandidate {
  id: string;
  title: string;
  source: string;
  summary: string;
  viralityScore: number;
  koreaFitScore: number;
}

interface ScriptDraft {
  jobId: string;
  titleOptions: string[];
  hook: string;
  narration: string;
  subtitles: string[];
  callToAction: string;
}

interface ProductionPackage {
  jobId: string;
  outputPath: string;
  files: Array<{
    label: string;
    path: string;
  }>;
}
```

### Output events from telegram-control-mcp

```ts
type TelegramControlEvent =
  | { type: "topic_selected"; candidateId: string; chatId: string }
  | { type: "script_approved"; jobId: string; chatId: string }
  | { type: "script_revision_requested"; jobId: string; chatId: string; note: string }
  | { type: "script_rejected"; jobId: string; chatId: string }
  | { type: "package_archived"; jobId: string; chatId: string };
```

## Storage Model

Need a small local state store for:

- Telegram bot configuration
- allowed chat ids
- active jobs
- pending callbacks
- revision notes
- last sent message ids

Suggested file:

- `mellowcat-vault/automation/telegram-control.json`

This can move to SQLite later if the workflow grows.

## Security Notes

- bot token must not be exposed to renderer
- token should live in main process secret storage
- callbacks must validate known chat ids
- only allow explicit admin chat ids during MVP

## Recommended Next Build Order

1. local types for automation jobs and stages
2. Telegram service in `src/main/services/automation/`
3. IPC surface for Telegram status and config
4. Settings UI for bot token and admin chat id
5. first end-to-end test:
   discovery mock -> Telegram selection -> script mock -> approval -> package mock

## Success Criteria

The MVP is successful when one user can:

- receive 3 to 5 topic candidates in Telegram
- choose one without opening the app
- review a generated draft in Telegram
- approve it
- receive a ready-to-produce package path

At that point, the system is sellable as a human-in-the-loop shortform assistant.
