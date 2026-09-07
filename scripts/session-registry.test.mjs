import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensure, readAll, deriveId } from "./session-registry.mjs";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "sess-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("deriveId produces stable id for same cwd", () => {
  const cwd = "/some/path";
  assert.equal(deriveId(cwd), deriveId(cwd));
  assert.match(deriveId(cwd), /^[a-f0-9]{12}$/);
});

test("ensure appends one line with required fields", () => {
  const { dir, cleanup } = setup();
  try {
    const rec = ensure({ cwd: "/x", registryPath: join(dir, "r.jsonl") });
    assert.equal(typeof rec.id, "string");
    assert.equal(rec.cwd, "/x");
    assert.equal(typeof rec.startedAt, "number");
    assert.ok(existsSync(join(dir, "r.jsonl")));
    const lines = readFileSync(join(dir, "r.jsonl"), "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.cwd, "/x");
  } finally {
    cleanup();
  }
});

test("readAll returns parsed entries", () => {
  const { dir, cleanup } = setup();
  try {
    ensure({ cwd: "/a", registryPath: join(dir, "r.jsonl") });
    ensure({ cwd: "/b", registryPath: join(dir, "r.jsonl") });
    const all = readAll(join(dir, "r.jsonl"));
    assert.equal(all.length, 2);
  } finally {
    cleanup();
  }
});