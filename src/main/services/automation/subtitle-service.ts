import type { SubtitleCue, VoiceoverCue } from "../../../common/types/media-generation";

export class SubtitleService {
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

  private pad(value: number): string {
    return value.toString().padStart(2, "0");
  }
}
