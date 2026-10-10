// Runs a script in Blender, headless (ADR 0012, plan 0005).
//
//   node tools/run-blender.mjs <script.py> [--blend <file.blend>] [-- script args]
//
// Finds Blender through the BLENDER environment variable (the full path to the executable), then `blender` on PATH.
// Stops with a clear message if neither works, as the brief requires. Exits with Blender's exit code.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function findBlender() {
  const fromEnv = process.env.BLENDER;
  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      console.error(`BLENDER is set to "${fromEnv}", but nothing is there.`);
      process.exit(1);
    }
    return fromEnv;
  }
  const probe = spawnSync("blender", ["--version"], { stdio: "ignore", shell: process.platform === "win32" });
  if (probe.status === 0) return "blender";
  console.error(
    "Blender was not found. Set BLENDER to the full path of the Blender 4.5 executable, or put Blender on PATH (ADR 0012).\n" +
      'On the build machine: C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe',
  );
  process.exit(1);
}

const argv = process.argv.slice(2);
const dashes = argv.indexOf("--");
const own = dashes >= 0 ? argv.slice(0, dashes) : argv;
const passThrough = dashes >= 0 ? argv.slice(dashes + 1) : [];
const script = own[0];
if (!script) {
  console.error("Usage: node tools/run-blender.mjs <script.py> [--blend <file.blend>] [-- script args]");
  process.exit(1);
}
const blendAt = own.indexOf("--blend");
const blend = blendAt >= 0 ? own[blendAt + 1] : null;

const blender = findBlender();
const args = ["--background", "--factory-startup"];
if (blend) args.push(resolve(blend));
args.push("--python-exit-code", "1", "--python", resolve(script), "--", ...passThrough);
const run = spawnSync(blender, args, { stdio: "inherit" });
process.exit(run.status ?? 1);
