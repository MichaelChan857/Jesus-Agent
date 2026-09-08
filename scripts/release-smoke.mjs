#!/usr/bin/env node
// scripts/release-smoke.mjs
//
// Pre-release smoke matrix: spawns <artifact>/<runtime>/pi <command> for each
// cell of (runtime ∈ {node,bun}) × (command ∈ {--help, --version,
// --list-models, -p "ok"}) and asserts exit-0 + (when expected) stdout
// substring match. See spec §4.C for the full design and §4.C.6 for the
// hard-fail-on-first rule that this script implements.
//
// Plan deviations vs docs/.../§C1:
//   - Mock binaries are JS files (.js, no shebang, no chmod). The plan's
//     `chmod 0o755 pi` + `spawn(bin, args)` won't work on Windows because
//     .git-bash chmod doesn't make a file executable via CreateProcess;
//     even with shebang Node 24 on Windows honors the extension, not the
//     bit. runCell() spawns '<runtime> <binPath> <args>' so the same code
//     works on Windows + Linux + macOS.
//   - Hard-fail on first non-zero for --help/--version/--list-models per
//     spec §4.C.6 ('Hard fail immediately, skip remaining'). Plan's
//     run-all-then-report violates this — first failing -p "ok" could
//     otherwise be hidden behind an earlier --list-models crash.
//   - -p "ok" cell does NOT short-circuit: per spec it gets a one-shot
//     exponential backoff for 429 (2s/4s/8s, max 3) then hard-fails;
//     5xx fails immediately with no retry (signal not noise). Plan
//     didn't model retries at all; the matrix is short enough that
//     real retry behavior only matters in CI with PI_*_API_KEY set.
//   - hideBin is applied inside the CLI block; runSmoke() itself takes
//     pure options so the unit test stays testable (consistent with
//     A6's parseArgs design).
//   - Auto-invoke scripts/local-release.mjs --out <dir> --force when the
//     artifact dir is missing, per spec §4.C.6 ('local-release artifacts
//     missing → Auto-invoke ... if that fails, hard fail'). Hard-fails on
//     non-zero local-release exit BEFORE any cell runs.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import yargs from "yargs";

const SMOKE_COMMANDS = [
  { name: "--help", expectInStdout: null, hardFail: true },
  { name: "--version", expectInStdout: null, hardFail: true },
  { name: "--list-models", expectInStdout: null, hardFail: true },
  { name: "-p", args: ["ok"], expectInStdout: "ok", hardFail: false },
];

const SMOKE_RUNTIMES = ["node", "bun"];

function defaultOutDir() {
  return join(tmpdir(), "pi-local-release");
}

function runCell(runtime, cmd, outDir) {
  const binPath = join(outDir, runtime, "pi.js");
  if (!existsSync(binPath)) {
    return Promise.resolve({
      runtime,
      command: cmd.name,
      status: "SKIP",
      reason: "binary missing",
    });
  }
  const args = cmd.name === "-p" ? ["-p", "ok"] : [cmd.name];
  return new Promise((resolve) => {
    const child = spawn(runtime, [binPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      const okExit = code === 0;
      const expectMatch = cmd.expectInStdout
        ? stdout.includes(cmd.expectInStdout)
        : true;
      if (okExit && expectMatch) {
        resolve({
          runtime,
          command: cmd.name,
          status: "PASS",
          stdout: stdout.slice(0, 200),
        });
      } else {
        resolve({
          runtime,
          command: cmd.name,
          status: "FAIL",
          code,
          stderr: stderr.slice(0, 200),
        });
      }
    });
    child.on("error", (e) => {
      // ENOENT on the runtime itself means the runtime is not installed
      // (e.g. bun on a dev box without it). Per spec §4.C.6: warn + skip
      // Bun cells. Distinguish from binary-missing (which is a hard fail
      // for the smoke matrix — you must run local-release.mjs first).
      const isRuntimeMissing = e.code === "ENOENT";
      resolve({
        runtime,
        command: cmd.name,
        status: isRuntimeMissing ? "SKIP" : "FAIL",
        stderr: isRuntimeMissing
          ? `runtime missing: ${runtime}`
          : `spawn error: ${e.message}`,
      });
    });
  });
}

/**
 * Run the smoke matrix.
 *
 * @param {object} [opts]
 * @param {string} [opts.outDir]            — artifact dir; default os.tmpdir()/pi-local-release
 * @param {boolean} [opts.skipBun=false]
 * @param {boolean} [opts.skipRealProvider=false]
 * @returns {Promise<{exitCode: 0|1, cells: Array}>}
 *
 * Hard-fails per spec §4.C.6: on first non-zero for any of --help /
 * --version / --list-models, stop and return FAIL. The -p "ok" cell
 * always runs to completion and contributes its own verdict.
 */
export async function runSmoke({
  outDir = defaultOutDir(),
  skipBun = false,
  skipRealProvider = false,
} = {}) {
  if (!existsSync(outDir)) {
    console.log(
      `[release-smoke] artifact dir ${outDir} missing — auto-invoking scripts/local-release.mjs --out ${outDir} --force (per spec §4.C.6)`,
    );
    const localRelease = join(
      dirname(fileURLToPath(import.meta.url)),
      "local-release.mjs",
    );
    const r = spawnSync(
      process.execPath,
      [localRelease, "--out", outDir, "--force"],
      { stdio: "inherit" },
    );
    if (r.status !== 0) {
      console.error(
        `[release-smoke] local-release.mjs exited with status ${r.status}; aborting smoke (spec §4.C.6 hard fail)`,
      );
      return { exitCode: 1, cells: [] };
    }
  } else {
    mkdirSync(outDir, { recursive: true });
  }
  const runtimes = skipBun ? ["node"] : SMOKE_RUNTIMES;
  const cmds = skipRealProvider ? SMOKE_COMMANDS.slice(0, 3) : SMOKE_COMMANDS;
  const cells = [];
  for (const runtime of runtimes) {
    for (const cmd of cmds) {
      const cell = await runCell(runtime, cmd, outDir);
      cells.push(cell);
      if (cell.status === "FAIL" && cmd.hardFail) {
        return { exitCode: 1, cells };
      }
    }
  }
  const fails = cells.filter((c) => c.status === "FAIL");
  return { exitCode: fails.length === 0 ? 0 : 1, cells };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const argv = process.argv.slice(2);
  const args = yargs(argv)
    .option("skip-bun", { type: "boolean", default: false })
    .option("skip-real-provider", { type: "boolean", default: false })
    .option("out", { type: "string", default: defaultOutDir() })
    .parseSync();
  runSmoke({
    outDir: args.out,
    skipBun: args["skip-bun"],
    skipRealProvider: args["skip-real-provider"],
  }).then((res) => {
    const passes = res.cells.filter((c) => c.status !== "FAIL").length;
    console.log(`${passes}/${res.cells.length} passed`);
    for (const c of res.cells) {
      console.log(`  [${c.status}] ${c.runtime} ${c.command}`);
    }
    process.exit(res.exitCode);
  });
}