import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const releaseDir = resolve(process.cwd(), "release");

await Promise.all([
  rm(resolve(releaseDir, "win-unpacked"), { recursive: true, force: true }),
  rm(resolve(releaseDir, "builder-debug.yml"), { force: true })
]);

console.log("Removed release build intermediates");
