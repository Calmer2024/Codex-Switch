import assert from "node:assert/strict";
import test from "node:test";
import { classifyCodexConnection } from "../src/main/codex-state.ts";

test("recognises a real official ChatGPT login shape", () => {
  assert.equal(classifyCodexConnection({ authMode: "chatgpt", hasChatGptToken: true, hasApiKey: false }).kind, "official");
});

test("recognises a Codex Switch relay even when auth.json still contains ChatGPT credentials", () => {
  assert.equal(classifyCodexConnection({ authMode: "chatgpt", hasChatGptToken: true, hasApiKey: false, providerName: "codex_switch", baseUrl: "https://relay.example/v1" }).kind, "relay");
});

test("recognises legacy API-key relay configuration", () => {
  assert.equal(classifyCodexConnection({ authMode: "apikey", hasChatGptToken: false, hasApiKey: true, providerName: "legacy", baseUrl: "https://relay.example/v1" }).kind, "relay");
});

test("does not mislabel an empty setup as official", () => {
  assert.equal(classifyCodexConnection({ hasChatGptToken: false, hasApiKey: false }).kind, "unknown");
});

test("surfaces malformed auth instead of silently treating it as official", () => {
  assert.equal(classifyCodexConnection({ hasChatGptToken: false, hasApiKey: false, authError: "JSON 格式无效" }).kind, "error");
});
