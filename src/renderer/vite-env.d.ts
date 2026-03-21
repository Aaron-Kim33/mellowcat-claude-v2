/// <reference types="vite/client" />

import type { MellowCatAPI } from "@common/types/ipc";

declare global {
  interface Window {
    mellowcat: MellowCatAPI;
  }
}
