import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const buildDir = resolve(root, "build");
const releaseDir = resolve(root, "release");
const configPath = resolve(buildDir, "dev-update.json");

const config = {
  enabled: true,
  releaseDir,
  channelFile: "latest.yml",
  generatedAt: new Date().toISOString()
};

await mkdir(buildDir, { recursive: true });
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

console.log(`Local update channel: ${releaseDir}`);
