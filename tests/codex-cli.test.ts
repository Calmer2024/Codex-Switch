import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWindowsLoginLaunch,
  codexCommandCandidates,
  parseCodexLoginStatus
} from "../src/main/codex-cli.ts";

test("recognises the authoritative CLI ChatGPT login status", () => {
  assert.equal(parseCodexLoginStatus(0, "Logged in using ChatGPT", ""), "chatgpt");
});

test("does not confuse an API-key CLI login with ChatGPT", () => {
  assert.equal(parseCodexLoginStatus(0, "Logged in using an API key", ""), "api");
});

test("finds the Codex desktop CLI before relying on PATH", () => {
  const candidates = codexCommandCandidates("win32", {
    LOCALAPPDATA: "C:\\Users\\demo\\AppData\\Local"
  });
  assert.equal(candidates[0], "C:\\Users\\demo\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe");
});

test("launches the resolved Codex executable without a shell quoting layer", () => {
  assert.deepEqual(
    buildWindowsLoginLaunch("C:\\Program Files\\OpenAI\\Codex\\bin\\codex.exe"),
    {
      command: "C:\\Program Files\\OpenAI\\Codex\\bin\\codex.exe",
      args: ["login"]
    }
  );
});
