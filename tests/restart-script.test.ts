import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("safe restart uses wildcard path matching instead of a fragile PowerShell regex", async () => {
  const source = await readFile(new URL("../src/main/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /ExecutablePath -match ['"][^'"\r\n]*vscode/i);
  assert.match(source, /ExecutablePath -like ['"]\*.*vscode.*\*['"]/i);
});
