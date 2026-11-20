#!/usr/bin/env node
/**
 * Runs before `npm start`: builds the app once if there is no production build yet,
 * so a fresh clone needs only `npm install`, `npm run setup` and `npm start`.
 * After an update (git pull), run `npm run build` yourself before `npm start`.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (fs.existsSync(path.join(root, ".next", "BUILD_ID"))) process.exit(0);

console.log("No production build yet: running `npm run build` (one time, a few minutes)...");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["run", "build"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
