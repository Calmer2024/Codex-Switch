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
  refreshUsage: () => ipcRenderer.invoke("codex-switch:refresh-usage"),
  connectDashboardAuth: (profileId: string) => ipcRenderer.invoke("codex-switch:connect-dashboard-auth", profileId),
  checkLocalUpdate: () => ipcRenderer.invoke("codex-switch:check-local-update"),
  installLocalUpdate: () => ipcRenderer.invoke("codex-switch:install-local-update"),
  revealPath: (kind: "codexHome" | "storage" | "backupRoot") => ipcRenderer.invoke("codex-switch:reveal-path", kind),
  openExternal: (url: string) => ipcRenderer.invoke("codex-switch:open-external", url)
};

contextBridge.exposeInMainWorld("codexSwitch", api);
