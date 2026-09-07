import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { check } from "./check-session-isolation.mjs";
import { ensure as ensureFor } from "./session-registry.mjs";

function gitInit(dir) {
  execSync("git init -q -b main", { cwd: dir });
  execSync("git config user.email t@t", { cwd: dir });
  execSync("git config user.name t", { cwd: dir });
  writeFileSync(join(dir, "README.md"), "x");
  execSync("git add README.md && git commit -q -m init", { cwd: dir });
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "iso-"));
  gitInit(dir);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("PASS: staged file is owned by current session", () => {
  const { dir, cleanup } = setup();
  try {
    const regPath = join(dir, "r.jsonl");
    const reg = ensureFor({ cwd: dir, registryPath: regPath, id: "sess-a" });
    writeFileSync(join(dir, "foo.ts"), "x");
    const res = check({
      mode: "commit",
      sessionId: reg.id,
      registryPath: regPath,
      cwd: dir,
      stagedFiles: ["foo.ts"],
      ownedFiles: ["foo.ts"],
      otherOwnedBySession: {},
    });
    assert.equal(res.verdict, "PASS");
  } finally {
    cleanup();
  }
});

test("PASS: lockfile and models.generated are always exempt", () => {
  const { dir, cleanup } = setup();
  try {
    const regPath = join(dir, "r.jsonl");
    const reg = ensureFor({ cwd: dir, registryPath: regPath, id: "sess-a" });
    const res = check({
      mode: "commit",
      sessionId: reg.id,
      registryPath: regPath,
      cwd: dir,
      stagedFiles: ["package-lock.json", "models.generated.ts"],
      ownedFiles: [],
      otherOwnedBySession: {},
    });
    assert.equal(res.verdict, "PASS");
  } finally {
    cleanup();
  }
});

test("FAIL: staged file owned by another registered session", () => {
  const { dir, cleanup } = setup();
  try {
    const regPath = join(dir, "r.jsonl");
    ensureFor({ cwd: dir, registryPath: regPath, id: "sess-a" });
    ensureFor({ cwd: dir, registryPath: regPath, id: "sess-b" });
    const res = check({
      mode: "commit",
      sessionId: "sess-a",
      registryPath: regPath,
      cwd: dir,
      stagedFiles: ["foo.ts"],
      ownedFiles: ["foo.ts", "bar.ts"],
      otherOwnedBySession: { "foo.ts": "sess-b" },
    });
    assert.equal(res.verdict, "FAIL");
    assert.match(res.reason, /sess-b/);
  } finally {
    cleanup();
  }
});

test("WARN (merge): same condition but mode=merge does not fail", () => {
  const { dir, cleanup } = setup();
  try {
    const regPath = join(dir, "r.jsonl");
    ensureFor({ cwd: dir, registryPath: regPath, id: "sess-a" });
    ensureFor({ cwd: dir, registryPath: regPath, id: "sess-b" });
    const res = check({
      mode: "merge",
      sessionId: "sess-a",
      registryPath: regPath,
      cwd: dir,
      stagedFiles: ["foo.ts"],
      ownedFiles: [],
      otherOwnedBySession: { "foo.ts": "sess-b" },
    });
    assert.equal(res.verdict, "WARN");
  } finally {
    cleanup();
  }
});