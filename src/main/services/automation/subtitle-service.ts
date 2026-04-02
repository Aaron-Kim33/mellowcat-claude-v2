import type { SubtitleCue, VoiceoverCue } from "../../../common/types/media-generation";

export class SubtitleService {
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
          cue.text.trim(),
          ""
        ].join("\n");
      })
      .join("\n")
      .trim();
  }

  buildAss(cues: SubtitleCue[]): string {
    const header = [
      "[Script Info]",
      "ScriptType: v4.00+",
      "PlayResX: 1080",
      "PlayResY: 1920",
      "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      "Style: Default,Gmarket Sans,8,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,3,0,0,2,60,60,90,1",
      "",
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ];

    const events = cues.map((cue) => {
      const text = cue.text
        .trim()
        .replace(/\r?\n+/g, "\\N")
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
}
