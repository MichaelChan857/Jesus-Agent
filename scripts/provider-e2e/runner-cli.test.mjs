import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "./runner.mjs";

test("parseArgs accepts --provider and --scenario", () => {
  const a = parseArgs(["--provider", "anthropic", "--scenario", "simple-stream"]);
  assert.equal(a.provider, "anthropic");
  assert.equal(a.scenario, "simple-stream");
  assert.equal(a.reporter, "console");
  assert.equal(a.fauxOnly, false);
});

test("parseArgs --faux-only flag", () => {
  const a = parseArgs(["--provider", "anthropic", "--faux-only"]);
  assert.equal(a.fauxOnly, true);
});