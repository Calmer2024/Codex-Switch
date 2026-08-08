import type { CodexConnectionKind } from "../shared/types";

export interface CodexConnectionInput {
  authMode?: string;
  hasChatGptToken: boolean;
  hasApiKey: boolean;
  providerName?: string;
  baseUrl?: string;
  authError?: string;
}

export interface CodexConnectionDetection {
  kind: CodexConnectionKind;
  message: string;
}

export function classifyCodexConnection(input: CodexConnectionInput): CodexConnectionDetection {
  if (input.authError) {
    return { kind: "error", message: `auth.json 读取失败：${input.authError}` };
  }

  if (input.baseUrl || input.providerName === "codex_switch" || input.authMode === "apikey" || input.hasApiKey) {
    if (!input.baseUrl) {
      return { kind: "error", message: "检测到 API Key/中转认证，但 config.toml 缺少可用的 base_url" };
    }
    return { kind: "relay", message: `正在使用中转站：${input.baseUrl}` };
  }

  if (input.authMode === "chatgpt") {
    return input.hasChatGptToken
      ? { kind: "official", message: "正在使用官方 ChatGPT 登录" }
      : { kind: "official", message: "已选择官方登录，但登录尚未完成" };
  }

  return { kind: "unknown", message: "未检测到官方登录或中转站配置" };
}
