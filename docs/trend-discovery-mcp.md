# Trend Discovery MCP

## Purpose

`trend-discovery-mcp` is the shortlist engine for the messenger-based shortform assistant.

Its job is not to render video or write final scripts.

Its job is to:

- collect candidate topics from global and domestic sources
- normalize them into one scoring format
- rank them for Korean shortform suitability
- hand the top candidates to Telegram or another control layer

## Why It Should Be Separate

The launcher should stay lightweight.

Heavy source collection and filtering can evolve independently from:

- Telegram control
- script generation
- production packaging
- upload helpers

This separation also lets MellowCat ship:

- a global-only pack
- a Korea-community pack
- a premium trend pack

without rewriting the launcher.

## Recommended Source Adapters

### Global

- Reddit-style story feeds
- RSS or creator-news feeds
- YouTube trend or metadata feeds

### Domestic

- FMKorea
- DC Inside
- Nate Pann

Each adapter should output the same candidate shape.

## Candidate Shape

```ts
interface TrendCandidate {
  id: string;
  title: string;
  summary: string;
  sourceKind: "reddit" | "rss" | "youtube" | "fmkorea" | "dcinside" | "nate-pann" | "mock";
  sourceRegion: "global" | "domestic";
  sourceLabel: string;
  sourceUrl?: string;
  score: number;
  metrics?: {
    upvoteRatio?: number;
    upvotes?: number;
    comments?: number;
    views?: number;
  };
  fitReason: string;
}
```

## Ranking Principle

The first version should optimize for:

- high click potential
- high retellability
- strong Korean localization angle
- shortform-friendly structure

The score does not need to be perfect on day one.

It needs to be consistent enough to produce a useful daily shortlist.

## Launcher Integration

The launcher should not know how each source works.

It only needs:

- `discoverCandidates()`
- a shortlist payload
- metadata for review/debugging

That means Telegram control can stay focused on:

- sending shortlist messages
- receiving button selections
- passing the chosen topic into script generation

## Recommended First Milestone

1. build adapter interfaces
2. add mock-backed global/domestic candidate outputs
3. replace hardcoded shortlist text with trend-discovery output
4. later swap mock adapters for real fetchers

This removes fake shortlist handling without forcing the whole crawling stack into the launcher immediately.
