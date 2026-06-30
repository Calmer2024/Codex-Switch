import type { CodexSwitchApi } from "../shared/types";

declare global {
  interface Window {
    codexSwitch?: CodexSwitchApi;
  }
}

export {};
