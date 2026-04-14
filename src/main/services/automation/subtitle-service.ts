import type {
  SceneScriptSubtitleStyle,
  SubtitleCue,
  VoiceoverCue
} from "../../../common/types/media-generation";

export class SubtitleService {
  private static readonly MAX_SUBTITLE_LINES = 3;
  private static readonly MAX_CHARS_PER_LINE = 18;

  retimeCues(cues: VoiceoverCue[], actualDurationSec?: number): { voiceoverCues: VoiceoverCue[]; subtitles: SubtitleCue[] } {
    if (!cues.length) {
      return { voiceoverCues: [], subtitles: [] };
    }

    const fallbackDuration = cues[cues.length - 1]?.endSec ?? 0;
    const targetDuration = actualDurationSec && actualDurationSec > 0 ? actualDurationSec : fallbackDuration;
    const weights = cues.map((cue) => Math.max(1, this.measureCueWeight(cue.text)));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || cues.length;

    let cursor = 0;
    const alignedVoiceoverCues = cues.map((cue, index) => {
      const remainingDuration = Math.max(0, targetDuration - cursor);
      const remainingWeight = weights.slice(index).reduce((sum, weight) => sum + weight, 0) || weights[index] || 1;
      const duration =
        index === cues.length - 1
          ? remainingDuration
          : Math.max(0.9, Number(((targetDuration * (weights[index] / totalWeight))).toFixed(2)));
      const adjustedDuration =
        index === cues.length - 1 ? Math.max(0.9, remainingDuration || duration) : Math.min(duration, remainingDuration);
      const startSec = cursor;
      const endSec = Number((startSec + adjustedDuration).toFixed(2));
      cursor = endSec;

      return {
        ...cue,
        startSec,
        endSec:
          index === cues.length - 1
            ? Number(targetDuration.toFixed(2))
            : endSec
      };
    });

    const subtitles = alignedVoiceoverCues.map((cue, index) => ({
      index: index + 1,
      startSec: cue.startSec,
      endSec: cue.endSec,
      text: cue.text
    }));

    return {
      voiceoverCues: alignedVoiceoverCues,
      subtitles
    };
  }

  buildSrt(cues: SubtitleCue[]): string {
    return cues
      .map((cue) => {
        return [
          cue.index.toString(),
          `${this.formatTimecode(cue.startSec)} --> ${this.formatTimecode(cue.endSec)}`,
          this.formatCueText(cue.text, "\n"),
          ""
        ].join("\n");
      })
      .join("\n")
      .trim();
  }

  buildAss(cues: SubtitleCue[], style?: SceneScriptSubtitleStyle): string {
    const normalizedStyle = this.resolveStyle(style);
    const header = [
      "[Script Info]",
      "ScriptType: v4.00+",
      "PlayResX: 1080",
      "PlayResY: 1920",
      "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      `Style: Default,${normalizedStyle.fontFamily},${normalizedStyle.fontSize},${normalizedStyle.primaryColour},${normalizedStyle.primaryColour},${normalizedStyle.outlineColour},${normalizedStyle.backColour},-1,0,0,0,100,100,0,0,${normalizedStyle.borderStyle},${normalizedStyle.outline},0,2,100,100,200,1`,
      "",
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ];

    const events = cues.map((cue) => {
      const text = this.formatCueText(cue.text, "\\N")
        .replace(/\{/g, "(")
        .replace(/\}/g, ")");
      return `Dialogue: 0,${this.formatAssTimecode(cue.startSec)},${this.formatAssTimecode(cue.endSec)},Default,,0,0,0,,${text}`;
    });

    return [...header, ...events].join("\n").trim();
  }

  buildVoiceoverScript(cues: VoiceoverCue[]): string {
    return cues
      .map((cue) => {
        const range = `${this.formatTimeLabel(cue.startSec)}-${this.formatTimeLabel(cue.endSec)}`;
        return `[Scene ${cue.sceneIndex} | ${range}] ${cue.text.trim()}`;
      })
      .join("\n\n")
      .trim();
  }

  private formatTimecode(totalSeconds: number): string {
    const safeValue = Math.max(0, totalSeconds);
    const hours = Math.floor(safeValue / 3600);
    const minutes = Math.floor((safeValue % 3600) / 60);
    const seconds = Math.floor(safeValue % 60);
    const milliseconds = Math.round((safeValue - Math.floor(safeValue)) * 1000);

    return `${this.pad(hours)}:${this.pad(minutes)}:${this.pad(seconds)},${milliseconds
      .toString()
      .padStart(3, "0")}`;
  }

  private formatTimeLabel(totalSeconds: number): string {
    const safeValue = Math.max(0, Math.round(totalSeconds));
    const minutes = Math.floor(safeValue / 60);
    const seconds = safeValue % 60;
    return `${this.pad(minutes)}:${this.pad(seconds)}`;
  }

  private formatAssTimecode(totalSeconds: number): string {
    const safeValue = Math.max(0, totalSeconds);
    const hours = Math.floor(safeValue / 3600);
    const minutes = Math.floor((safeValue % 3600) / 60);
    const seconds = Math.floor(safeValue % 60);
    const centiseconds = Math.round((safeValue - Math.floor(safeValue)) * 100);

    return `${hours}:${this.pad(minutes)}:${this.pad(seconds)}.${centiseconds
      .toString()
      .padStart(2, "0")}`;
  }

  private pad(value: number): string {
    return value.toString().padStart(2, "0");
  }

  private measureCueWeight(text: string): number {
    return text.replace(/\s+/g, "").length;
  }

  private resolveStyle(style?: SceneScriptSubtitleStyle): {
    fontFamily: string;
    fontSize: number;
    primaryColour: string;
    outlineColour: string;
    backColour: string;
    borderStyle: 1 | 3;
    outline: number;
  } {
    const fontFamily = style?.fontFamily?.trim() || "Gmarket Sans";
    const fontSize = Math.max(8, Number(style?.fontSize) || 30);
    const primaryColour = this.toAssColor(style?.color, "00FFFFFF");
    const outlineColour = this.toAssColor(style?.outlineColor, "00000000");
    const isBox = style?.mode === "box";
    const outline = isBox ? 0 : Math.max(0, Number(style?.outline) || 0);

    return {
      fontFamily,
      fontSize,
      primaryColour,
      outlineColour,
      backColour: isBox ? "88000000" : "00000000",
      borderStyle: isBox ? 3 : 1,
      outline
    };
  }

  private formatCueText(text: string, lineBreakToken: "\n" | "\\N"): string {
    const normalized = text
      .replace(/\r?\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) {
      return "";
    }

    const wrappedLines = this.wrapCaptionLines(
      normalized,
      SubtitleService.MAX_CHARS_PER_LINE
    );
    const limitedLines = wrappedLines.slice(0, SubtitleService.MAX_SUBTITLE_LINES);
    if (wrappedLines.length > SubtitleService.MAX_SUBTITLE_LINES && limitedLines.length > 0) {
      const lastIndex = limitedLines.length - 1;
      limitedLines[lastIndex] = this.ellipsize(limitedLines[lastIndex], SubtitleService.MAX_CHARS_PER_LINE);
    }

    return limitedLines.join(lineBreakToken);
  }

  private wrapCaptionLines(text: string, maxCharsPerLine: number): string[] {
    const lines: string[] = [];
    let remaining = text.trim();

    while (remaining.length > 0) {
      if (remaining.length <= maxCharsPerLine) {
        lines.push(remaining);
        break;
      }

      const slice = remaining.slice(0, maxCharsPerLine + 1);
      let breakIndex = slice.lastIndexOf(" ");
      if (breakIndex < Math.floor(maxCharsPerLine * 0.5)) {
        breakIndex = maxCharsPerLine;
      }

      const line = remaining.slice(0, breakIndex).trim();
      if (!line) {
        break;
      }
      lines.push(line);
      remaining = remaining.slice(breakIndex).trim();
    }

    return lines;
  }

  private ellipsize(text: string, maxChars: number): string {
    const value = text.trim();
    if (value.length <= maxChars) {
      return value;
    }
    if (maxChars <= 1) {
      return "…";
    }
    return `${value.slice(0, maxChars - 1).trim()}…`;
  }

  private toAssColor(value: string | undefined, fallback: string): string {
    const hex = value?.trim().replace("#", "");
    if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) {
      return `&H${fallback}`;
    }

    const rr = hex.slice(0, 2).toUpperCase();
    const gg = hex.slice(2, 4).toUpperCase();
    const bb = hex.slice(4, 6).toUpperCase();
    return `&H00${bb}${gg}${rr}`;
  }
}
