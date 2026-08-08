import { rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const releaseDir = resolve(root, "release");

if (dirname(releaseDir) !== root || basename(releaseDir) !== "release") {
  throw new Error(`Refusing to clean unexpected path: ${releaseDir}`);
}

await rm(releaseDir, { recursive: true, force: true });
console.log(`Cleaned release output: ${releaseDir}`);
