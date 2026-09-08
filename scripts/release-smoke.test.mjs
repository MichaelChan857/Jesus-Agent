import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSmoke } from "./release-smoke.mjs";

function setupFixtures() {
  const root = mkdtempSync(join(tmpdir(), "smoke-"));
  mkdirSync(join(root, "node"), { recursive: true });
  mkdirSync(join(root, "bun"), { recursive: true });
  // Mock node/pi — just JS, no shebang, no chmod. runCell spawns
  // `<runtime> <binPath> <args>` so this works on Windows and Linux.
  writeFileSync(
    join(root, "node", "pi.js"),
    `const arg = process.argv[2];
if (arg === "--help") { console.log("Usage: pi"); process.exit(0); }
if (arg === "--version") { console.log("0.0.0"); process.exit(0); }
if (arg === "--list-models") { console.log("faux-1"); process.exit(0); }
if (arg === "-p") { console.log("ok"); process.exit(0); }
console.log("noop"); process.exit(0);`,
  );
  writeFileSync(
    join(root, "bun", "pi.js"),
    `const arg = process.argv[2];
if (arg === "--help") { console.log("Usage: pi"); process.exit(0); }
if (arg === "--version") { console.log("0.0.0"); process.exit(0); }
if (arg === "--list-models") { console.log("faux-1"); process.exit(0); }
if (arg === "-p") { console.log("ok"); process.exit(0); }
console.log("noop"); process.exit(0);`,
  );
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("runSmoke passes all 8 cells against mock fixtures", async () => {
  const { root, cleanup } = setupFixtures();
  try {
    const res = await runSmoke({
      outDir: root,
      skipBun: false,
      skipRealProvider: false,
    });
    assert.equal(res.exitCode, 0);
    assert.equal(res.cells.length, 8);
    // Per spec §4.C.6: runtime missing (e.g. bun not installed) is a
    // SKIP, not a FAIL. CI installs bun; dev boxes without bun are fine.
    for (const c of res.cells) {
      assert.ok(
        c.status === "PASS" || c.status === "SKIP",
        `cell ${c.runtime} ${c.command}: ${c.stderr ?? ""}`,
      );
    }
  } finally {
    cleanup();
  }
});

test("runSmoke --skip-bun reduces to 4 cells (keeps real-provider)", async () => {
  const { root, cleanup } = setupFixtures();
  try {
    const res = await runSmoke({
      outDir: root,
      skipBun: true,
      skipRealProvider: false,
    });
    assert.equal(res.cells.length, 4);
  } finally {
    cleanup();
  }
});

test("runSmoke --skip-real-provider reduces to 6 cells (keeps bun)", async () => {
  const { root, cleanup } = setupFixtures();
  try {
    const res = await runSmoke({
      outDir: root,
      skipBun: false,
      skipRealProvider: true,
    });
    assert.equal(res.cells.length, 6);
  } finally {
    cleanup();
  }
});

test("runSmoke hard-fails on first --help failure (per spec §4.C.6)", async () => {
  const root = mkdtempSync(join(tmpdir(), "smoke-"));
  mkdirSync(join(root, "node"), { recursive: true });
  mkdirSync(join(root, "bun"), { recursive: true });
  // node/pi.js exits non-zero on --help
  writeFileSync(
    join(root, "node", "pi.js"),
    `const arg = process.argv[2];
if (arg === "--help") process.exit(2);
process.exit(0);`,
  );
  // bun/pi.js — would pass, but we should never reach it (hard fail stops)
  writeFileSync(
    join(root, "bun", "pi.js"),
    `process.exit(0);`,
  );
  try {
    const res = await runSmoke({
      outDir: root,
      skipBun: false,
      skipRealProvider: true, // skip -p to keep test focused
    });
    assert.equal(res.exitCode, 1);
    // Only the first failing cell should be recorded (hard-fail short-circuit).
    assert.equal(res.cells.length, 1);
    assert.equal(res.cells[0].command, "--help");
    assert.equal(res.cells[0].status, "FAIL");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});