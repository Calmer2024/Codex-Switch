import { contextBridge, ipcRenderer } from "electron";
import type { CodexSwitchApi, SaveProfileInput, TestProfileInput, UpdateProfileTagsInput } from "../shared/types";

const api: CodexSwitchApi = {
  getState: () => ipcRenderer.invoke("codex-switch:get-state"),
  detectProvider: (baseUrl: string) => ipcRenderer.invoke("codex-switch:detect-provider", baseUrl),
  saveProfile: (input: SaveProfileInput) => ipcRenderer.invoke("codex-switch:save-profile", input),
  applyProfile: (profileId: string) => ipcRenderer.invoke("codex-switch:apply-profile", profileId),
  deleteProfile: (profileId: string) => ipcRenderer.invoke("codex-switch:delete-profile", profileId),
  updateProfileTags: (input: UpdateProfileTagsInput) => ipcRenderer.invoke("codex-switch:update-profile-tags", input),
  importCurrentConfig: () => ipcRenderer.invoke("codex-switch:import-current"),
  testProfile: (input: TestProfileInput) => ipcRenderer.invoke("codex-switch:test-profile", input),
  revealPath: (kind: "codexHome" | "storage" | "backupRoot") => ipcRenderer.invoke("codex-switch:reveal-path", kind)
};

contextBridge.exposeInMainWorld("codexSwitch", api);
