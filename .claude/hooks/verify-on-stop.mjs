#!/usr/bin/env node
/**
 * Stop hook: gate the end of a turn on the same checks CI runs.
 *
 * Design notes:
 * - Runs on Stop, not PostToolUse. A per-edit run would fire once per edit and
 *   still miss changes made through the shell; the turn boundary is the cheapest
 *   place that catches a broken tree before the user acts on it.
 * - `stop_hook_active` is the re-entry guard. Without it a failing check would
 *   block, Claude would respond, Stop would fire again, and the turn would loop.
 * - Both workspaces run whenever any source changed. Scoping the app checks to
 *   app/ edits is what let a broken build reach main: the engine schema changed,
 *   the form still bound to the removed field, and the root scripts never look
 *   inside app/.
 * - Verification runs only when tracked sources actually changed, so a
 *   conversation that touched nothing pays nothing.
 * - Exit code 2 feeds stderr back to Claude, which must then address it.
 * - This is a completion gate, not absolute enforcement: Stop does not fire on
 *   user interrupt and hook timeouts fail open. The same checks belong in
 *   pre-push and CI.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const SOURCE_PATTERN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json)$/;

/** Mirrors .github/workflows/ci.yml, minus the `npm ci` steps. */
const STEPS = [
  { workspace: ".", script: "typecheck" },
  { workspace: ".", script: "lint" },
  { workspace: ".", script: "test" },
  { workspace: "app", script: "lint" },
  { workspace: "app", script: "test" },
  // `npm run build` in app is `tsc -b && vite build`, so it covers type checking.
  { workspace: "app", script: "build" }
];

/** @returns {Promise<Record<string, unknown>>} the hook event, or {} if unreadable */
async function readEvent() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

/** @returns {string[]} paths of changed files, relative to the repo root */
function changedFiles() {
  const out = execFileSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  return out
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

/** @returns {string|null} combined output when the script fails, else null */
function runScript(workspace, script) {
  try {
    execFileSync("npm", ["run", "--silent", script], {
      cwd: path.join(repoRoot, workspace),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32"
    });
    return null;
  } catch (err) {
    return `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
  }
}

async function main() {
  const event = await readEvent();
  if (event.stop_hook_active) process.exit(0); // already re-entered; do not loop

  let files;
  try {
    files = changedFiles();
  } catch {
    process.exit(0); // not a git repo, or git unavailable — stay out of the way
  }

  if (!files.some((f) => SOURCE_PATTERN.test(f))) process.exit(0);

  for (const { workspace, script } of STEPS) {
    const failure = runScript(workspace, script);
    if (failure) {
      const label = workspace === "." ? script : `${workspace}: ${script}`;
      process.stderr.write(
        `${label} failed. Fix this before reporting the work as done.\n\n${failure}\n`
      );
      process.exit(2);
    }
  }

  process.exit(0);
}

main();
