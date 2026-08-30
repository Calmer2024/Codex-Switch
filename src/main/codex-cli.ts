import { join } from "node:path";

export type CodexCliLoginKind = "chatgpt" | "api" | "none" | "unknown";

type Environment = Record<string, string | undefined>;

export function parseCodexLoginStatus(code: number | null, stdout: string, stderr: string): CodexCliLoginKind {
  const output = `${stdout}\n${stderr}`.trim();
  if (/not logged in/i.test(output)) {
    return "none";
  }
  if (code === 0 && /logged in using chatgpt/i.test(output)) {
    return "chatgpt";
  }
  if (code === 0 && /logged in using (?:an? )?api key/i.test(output)) {
    return "api";
  }
  return "unknown";
}

export function codexCommandCandidates(platform: NodeJS.Platform, env: Environment): string[] {
  const candidates: string[] = [];
  if (env.CODEX_EXECUTABLE?.trim()) {
    candidates.push(env.CODEX_EXECUTABLE.trim());
  }
  if (platform === "win32" && env.LOCALAPPDATA) {
    candidates.push(join(env.LOCALAPPDATA, "Programs", "OpenAI", "Codex", "bin", "codex.exe"));
  }
  candidates.push("codex");
  return Array.from(new Set(candidates));
}

export function buildWindowsLoginLaunch(codexCommand: string): { command: string; args: string[] } {
  return {
    command: codexCommand,
    args: ["login"]
  };
}

export function buildWindowsStatusInvocation(codexCommand: string): { command: string; args: string[] } {
  return {
    command: codexCommand,
    args: ["login", "status"]
  };
}
