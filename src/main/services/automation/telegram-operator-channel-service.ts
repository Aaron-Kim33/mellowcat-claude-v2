import type { OperatorChannelEvent } from "../../../common/types/operator-channel";
import { ShortformWorkflowConfigService } from "./shortform-workflow-config-service";
import type { OperatorChannelService } from "./operator-channel-service";

export class TelegramOperatorChannelService implements OperatorChannelService {
  constructor(private readonly workflowConfigService: ShortformWorkflowConfigService) {}

  async notify(event: OperatorChannelEvent): Promise<void> {
    const workflowConfig = this.workflowConfigService.get();
    const botToken = workflowConfig.telegramBotToken?.trim();
    const chatId = workflowConfig.telegramAdminChatId?.trim();

    if (!botToken || !chatId) {
      return;
    }

    const language = workflowConfig.telegramOutputLanguage ?? "ko";
    const text = this.formatMessage(event, language);

    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text
        })
      });

      if (!response.ok) {
        console.warn(`Telegram operator notify failed: HTTP ${response.status}`);
      }
    } catch (error) {
      console.warn("Telegram operator notify failed:", error);
    }
  }

  private formatMessage(event: OperatorChannelEvent, language: "en" | "ko"): string {
    if (language === "ko") {
      switch (event.type) {
        case "create_started":
          return [
            "03 소재 생성 시작",
            "",
            `작업: ${event.title}`,
            `Job ID: ${event.jobId}`,
            "scene plan, 자산 준비, 더빙, 합성을 순서대로 진행합니다."
          ].join("\n");
        case "create_progress":
          return [
            "03 소재 생성 진행 중",
            "",
            `작업: ${event.title}`,
            `Job ID: ${event.jobId}`,
            `단계: ${this.formatStage(event.stage, "ko")}`,
            event.detail
          ].join("\n");
        case "create_succeeded":
          return [
            "03 소재 생성 완료",
            "",
            `작업: ${event.title}`,
            `Job ID: ${event.jobId}`,
            `패키지 경로: ${event.packagePath}`,
            event.finalVideoPath ? `최종 영상: ${event.finalVideoPath}` : "최종 영상 경로는 아직 없습니다."
          ].join("\n");
        case "create_failed":
          return [
            "03 소재 생성 실패",
            "",
            `작업: ${event.title}`,
            `Job ID: ${event.jobId}`,
            `오류: ${event.error}`
          ].join("\n");
        case "upload_succeeded":
          return [
            "04 업로드 완료",
            "",
            `작업: ${event.title}`,
            `Job ID: ${event.jobId}`,
            event.videoUrl ? `영상 링크: ${event.videoUrl}` : "영상 링크는 반환되지 않았습니다."
          ].join("\n");
        case "upload_failed":
          return [
            "04 업로드 실패",
            "",
            `작업: ${event.title}`,
            `Job ID: ${event.jobId}`,
            `오류: ${event.error}`
          ].join("\n");
      }
    }

    switch (event.type) {
      case "create_started":
        return [
          "Slot 03 create started",
          "",
          `Title: ${event.title}`,
          `Job ID: ${event.jobId}`,
          "Running scene planning, asset preparation, dubbing, and composition."
        ].join("\n");
      case "create_progress":
        return [
          "Slot 03 create in progress",
          "",
          `Title: ${event.title}`,
          `Job ID: ${event.jobId}`,
          `Stage: ${this.formatStage(event.stage, "en")}`,
          event.detail
        ].join("\n");
      case "create_succeeded":
        return [
          "Slot 03 create finished",
          "",
          `Title: ${event.title}`,
          `Job ID: ${event.jobId}`,
          `Package: ${event.packagePath}`,
          event.finalVideoPath ? `Final video: ${event.finalVideoPath}` : "No final video path was returned."
        ].join("\n");
      case "create_failed":
        return [
          "Slot 03 create failed",
          "",
          `Title: ${event.title}`,
          `Job ID: ${event.jobId}`,
          `Error: ${event.error}`
        ].join("\n");
      case "upload_succeeded":
        return [
          "Slot 04 upload complete",
          "",
          `Title: ${event.title}`,
          `Job ID: ${event.jobId}`,
          event.videoUrl ? `Video: ${event.videoUrl}` : "No video URL was returned."
        ].join("\n");
      case "upload_failed":
        return [
          "Slot 04 upload failed",
          "",
          `Title: ${event.title}`,
          `Job ID: ${event.jobId}`,
          `Error: ${event.error}`
        ].join("\n");
    }
  }

  private formatStage(stage: "scene_plan" | "asset_prep" | "voiceover" | "composition", language: "en" | "ko") {
    if (language === "ko") {
      switch (stage) {
        case "scene_plan":
          return "씬 플랜 생성";
        case "asset_prep":
          return "배경 자산 준비";
        case "voiceover":
          return "더빙 생성";
        case "composition":
          return "영상 합성";
      }
    }

    switch (stage) {
      case "scene_plan":
        return "Scene plan";
      case "asset_prep":
        return "Background asset";
      case "voiceover":
        return "Voiceover";
      case "composition":
        return "Composition";
    }
  }
}
