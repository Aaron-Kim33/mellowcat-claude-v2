const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function extractPlayerResponse(html) {
  const marker = "ytInitialPlayerResponse";
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }
  const startIndex = html.indexOf("{", markerIndex);
  if (startIndex === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let endIndex = -1;
  for (let i = startIndex; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }
  if (endIndex === -1) {
    return null;
  }
  try {
    return JSON.parse(html.slice(startIndex, endIndex));
  } catch {
    return null;
  }
}

function decodeHtml(input) {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function parseXmlOrSrv3(content) {
  const textMatches = [...content.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)];
  if (textMatches.length > 0) {
    return textMatches.map((m) => decodeHtml(m[1]).trim()).filter(Boolean).join("\n").trim();
  }
  const pMatches = [...content.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  if (pMatches.length > 0) {
    return pMatches
      .map((m) => decodeHtml(m[1].replace(/<s\b[^>]*>/gi, "").replace(/<\/s>/gi, "")).trim())
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function parseVtt(content) {
  if (!content.includes("WEBVTT")) return "";
  return content
    .split(/\r?\n/)
    .filter((line) => line && !line.includes("-->") && !line.startsWith("WEBVTT"))
    .map((line) => line.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildCandidates(baseUrl) {
  const urls = [];
  const seen = new Set();
  const push = (u) => {
    if (!seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  };

  push(baseUrl);
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("fmt", "srv3");
    push(url.toString());
    url.searchParams.set("fmt", "vtt");
    push(url.toString());
  } catch {
    // no-op
  }
  return urls;
}

async function inspectVideo(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=ko`;
  const watchResp = await fetch(watchUrl, {
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });
  const html = await watchResp.text();
  const player = extractPlayerResponse(html);
  if (!player) {
    return { videoId, error: "player_response_not_found" };
  }

  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return { videoId, error: "caption_tracks_missing" };
  }

  const trackAttempts = [];
  for (const track of tracks) {
    const candidates = buildCandidates(track.baseUrl);
    const attempts = [];
    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          headers: {
            "user-agent": USER_AGENT,
            "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            referer: `https://www.youtube.com/watch?v=${videoId}`,
            origin: "https://www.youtube.com",
          },
        });
        const body = await res.text();
        const parsed = parseXmlOrSrv3(body) || parseVtt(body);
        attempts.push({
          url,
          status: res.status,
          bodyLength: body.length,
          parsedLength: parsed.length,
          preview: parsed.slice(0, 120),
        });
        if (parsed.length > 0) {
          break;
        }
      } catch (error) {
        attempts.push({ url, error: String(error) });
      }
    }
    trackAttempts.push({
      kind: track.kind ?? "unknown",
      vssId: track.vssId ?? "",
      languageCode: track.languageCode ?? "",
      name: track?.name?.simpleText ?? "",
      attempts,
    });
  }

  const unsignedAttempts = [];
  const unsignedUrls = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=ko&kind=asr&fmt=vtt`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=ko&kind=asr&fmt=srv3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=ko`,
  ];
  for (const url of unsignedUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          referer: `https://www.youtube.com/watch?v=${videoId}`,
          origin: "https://www.youtube.com",
        },
      });
      const body = await res.text();
      const parsed = parseXmlOrSrv3(body) || parseVtt(body);
      unsignedAttempts.push({
        url,
        status: res.status,
        bodyLength: body.length,
        parsedLength: parsed.length,
        preview: parsed.slice(0, 120),
      });
    } catch (error) {
      unsignedAttempts.push({ url, error: String(error) });
    }
  }

  return {
    videoId,
    trackCount: tracks.length,
    tracks: trackAttempts,
    unsignedAttempts,
  };
}

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("usage: node scripts/debug-youtube-captions.mjs <videoId> [videoId...]");
    process.exit(1);
  }

  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    const result = await inspectVideo(id);
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
