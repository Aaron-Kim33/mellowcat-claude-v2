import type { OperatorChannelEvent } from "../../../common/types/operator-channel";

export interface OperatorChannelService {
  notify(event: OperatorChannelEvent): Promise<void>;
}

