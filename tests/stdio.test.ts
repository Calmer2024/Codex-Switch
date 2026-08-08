import assert from "node:assert/strict";
import test from "node:test";
import { isBrokenPipeError } from "../src/main/stdio.ts";

test("recognises Windows broken-pipe errors from closed Codex token pipes", () => {
  assert.equal(isBrokenPipeError(Object.assign(new Error("broken pipe, write"), { code: "EPIPE" })), true);
  assert.equal(isBrokenPipeError(Object.assign(new Error("other"), { code: "EACCES" })), false);
  assert.equal(isBrokenPipeError("EPIPE"), false);
});
