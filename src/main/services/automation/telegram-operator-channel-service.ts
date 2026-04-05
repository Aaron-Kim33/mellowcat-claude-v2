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
            `오류: ${event.error}`,
            this.buildUploadFailureGuidance(event.error, "ko")
          ]
            .filter(Boolean)
            .join("\n");
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
          `Error: ${event.error}`,
          this.buildUploadFailureGuidance(event.error, "en")
        ]
          .filter(Boolean)
          .join("\n");
    }
  }

  private formatStage(
    stage: "scene_plan" | "asset_prep" | "voiceover" | "composition",
    language: "en" | "ko"
  ) {
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

  private buildUploadFailureGuidance(error: string, language: "en" | "ko"): string {
    const normalized = error.toLowerCase();
    const tokenExpired =
      normalized.includes("invalid_grant") &&
      (normalized.includes("expired") || normalized.includes("revoked"));

    if (tokenExpired) {
      return language === "ko"
        ? "안내: 유튜브 세션이 만료되었거나 권한이 해제된 상태예요. 런처에서 04 배포 슬롯의 `유튜브 연결`을 다시 진행한 뒤 업로드를 다시 시도해주세요."
        : "Guidance: the YouTube session has expired or been revoked. Reconnect YouTube from Slot 04 in the launcher, then try the upload again.";
    }

    if (normalized.includes("invalid_grant")) {
      return language === "ko"
        ? "안내: 현재 유튜브 인증 정보가 유효하지 않아요. 런처에서 04 배포 슬롯의 `유튜브 연결`을 다시 진행해 주세요."
        : "Guidance: the current YouTube credentials are no longer valid. Reconnect YouTube from Slot 04 in the launcher.";
    }

    if (normalized.includes("unauthorized") || normalized.includes("401")) {
      return language === "ko"
        ? "안내: 유튜브 인증이 통과되지 않았어요. 런처에서 04 배포 슬롯의 연결 상태를 확인하고 다시 연결해 주세요."
        : "Guidance: YouTube authentication did not pass. Check Slot 04 and reconnect if needed.";
    }

    if (normalized.includes("quota")) {
      return language === "ko"
        ? "안내: 유튜브 API 할당량 문제일 수 있어요. 잠시 뒤 다시 시도하거나 Google Cloud 프로젝트 할당량을 확인해 주세요."
        : "Guidance: this may be a YouTube API quota issue. Retry later or check the Google Cloud project quota.";
    }

    if (normalized.includes("video file path does not exist")) {
      return language === "ko"
        ? "안내: 업로드할 최종 영상 파일을 찾지 못했어요. 03 소재 생성이 정상 완료되었는지 먼저 확인해 주세요."
        : "Guidance: the final video file could not be found. Make sure Slot 03 create finished successfully first.";
    }

    return language === "ko"
      ? "안내: 04 배포 슬롯의 설정과 연결 상태를 확인한 뒤 다시 시도해 주세요."
      : "Guidance: check the Slot 04 delivery settings and connection state, then try again.";
  }
}
