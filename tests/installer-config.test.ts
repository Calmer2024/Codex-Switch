import assert from "node:assert/strict";
import test from "node:test";
import packageJson from "../package.json" with { type: "json" };

test("the NSIS installer lets users choose an installation directory", () => {
  assert.equal(packageJson.build.nsis.oneClick, false);
  assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, true);
});

test("production updates use the explicit Codex Switch GitHub release feed", () => {
  assert.deepEqual(packageJson.build.publish, {
    provider: "github",
    owner: "Calmer2024",
    repo: "Codex-Switch"
  });
  assert.equal(packageJson.dependencies["electron-updater"], "^6.8.9");
  assert.equal(packageJson.build.extraResources.some((resource) => "to" in resource && resource.to === "dev-update.json"), false);
});

test("Windows executable signing is not disabled", () => {
  assert.equal("signExecutable" in packageJson.build.win, false);
});
