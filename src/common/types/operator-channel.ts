export type OperatorChannelEvent =
  | {
      type: "create_started";
      jobId: string;
      title: string;
    }
  | {
      type: "create_progress";
      jobId: string;
      title: string;
      stage: "scene_plan" | "asset_prep" | "voiceover" | "composition";
      detail: string;
    }
  | {
      type: "create_succeeded";
      jobId: string;
      title: string;
      packagePath: string;
      finalVideoPath?: string;
    }
  | {
      type: "create_failed";
      jobId: string;
      title: string;
      error: string;
    }
  | {
      type: "upload_succeeded";
      jobId: string;
      title: string;
      videoUrl?: string;
    }
  | {
      type: "upload_failed";
      jobId: string;
      title: string;
      error: string;
    };
