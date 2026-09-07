import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { ensure } from "../session-registry.mjs";
import { check } from "../check-session-isolation.mjs";

function gitInit(dir) {
  execSync("git init -q -b main", { cwd: dir });
  execSync("git config user.email t@t", { cwd: dir });
  execSync("git config user.name t", { cwd: dir });
  writeFileSync(join(dir, "README.md"), "x");
  execSync("git add README.md && git commit -q -m init", { cwd: dir });
}

test("second session cannot commit file owned by first", () => {
  const dir = mkdtempSync(join(tmpdir(), "col-"));
  try {
    gitInit(dir);
    const regPath = join(dir, "r.jsonl");
    const a = ensure({ cwd: dir, registryPath: regPath, id: "sess-a" });
    const b = ensure({ cwd: dir, registryPath: regPath, id: "sess-b" });

    // sess-a writes foo.ts; sess-b tries to commit it
    writeFileSync(join(dir, "foo.ts"), "alpha");
    execSync("git add foo.ts", { cwd: dir });

    // sess-b runs pre-commit: foo.ts is staged, not in b's owned set,
    // but external coordination signal says sess-a owns it.
    const res = check({
      mode: "commit",
      sessionId: b.id,
      registryPath: regPath,
      cwd: dir,
      stagedFiles: ["foo.ts"],
      ownedFiles: [],
      otherOwnedBySession: { "foo.ts": a.id },
    });
    assert.equal(res.verdict, "FAIL");
    assert.match(res.reason, /sess-a/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("merge mode surfaces WARN instead of FAIL for the same conflict", () => {
  const dir = mkdtempSync(join(tmpdir(), "col-"));
  try {
    gitInit(dir);
    const regPath = join(dir, "r.jsonl");
    const a = ensure({ cwd: dir, registryPath: regPath, id: "sess-a" });
    const b = ensure({ cwd: dir, registryPath: regPath, id: "sess-b" });
    const res = check({
      mode: "merge",
      sessionId: b.id,
      registryPath: regPath,
      cwd: dir,
      stagedFiles: ["foo.ts"],
      ownedFiles: [],
      otherOwnedBySession: { "foo.ts": a.id },
    });
    assert.equal(res.verdict, "WARN");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});