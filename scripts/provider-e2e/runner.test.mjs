// scripts/provider-e2e/runner.test.mjs
//
// Tests for scripts/provider-e2e/scenario-loader.mjs.
// Validates discovery by glob + per-file default-export contract.
// Plan reference: docs/superpowers/plans/2026-08-31-jesus-improvements-route-a.md §Task A1.
//
// Convention for scenarios under scripts/provider-e2e/scenarios/:
//   - file extension `.scenario.mjs` (one file per scenario, not a directory)
//   - default export is `{ name: string, providers: string[], run: (ctx) => Promise<void>, timeoutMs?: number }`
//
// See spec §"Provider e2e harness" for the full contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverScenariosAsync } from "./scenario-loader.mjs";

test("discoverScenariosAsync finds and validates scenario files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "scen-"));

  // one valid scenario
  writeFileSync(
    join(dir, "good.scenario.mjs"),
    `export default { name: "g", providers: ["anthropic"], async run() {} }`,
  );

  // missing default export
  writeFileSync(join(dir, "bad-no-default.scenario.mjs"), `export const x = 1`);

  // default export missing `run`
  writeFileSync(
    join(dir, "bad-no-run.scenario.mjs"),
    `export default { name: "x", providers: ["anthropic"] }`,
  );

  // default export with non-array `providers`
  writeFileSync(
    join(dir, "bad-providers-not-array.scenario.mjs"),
    `export default { name: "x", providers: "anthropic", async run() {} }`,
  );

  // unrelated file (should be ignored by glob)
  writeFileSync(join(dir, "README.md"), `# notes`);

  const { valid, invalid } = await discoverScenariosAsync(dir);
  assert.equal(valid.length, 1, "exactly one valid scenario");
  assert.equal(valid[0].name, "g");
  assert.equal(invalid.length, 3, "three invalid scenarios");
  for (const inv of invalid) {
    assert.equal(typeof inv.path, "string");
    assert.match(inv.reason, /missing/);
  }
});

test("discoverScenariosAsync returns empty arrays for an empty directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "scen-empty-"));
  const { valid, invalid } = await discoverScenariosAsync(dir);
  assert.deepEqual(valid, []);
  assert.deepEqual(invalid, []);
});

test("discoverScenariosAsync only matches *.scenario.mjs files (not unrelated .mjs)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "scen-strict-"));
  // non-scenario .mjs file should not be picked up
  writeFileSync(join(dir, "helper.mjs"), `export const x = 1`);
  // valid scenario
  writeFileSync(
    join(dir, "only.scenario.mjs"),
    `export default { name: "o", providers: ["anthropic"], async run() {} }`,
  );
  const { valid, invalid } = await discoverScenariosAsync(dir);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].name, "o");
  assert.equal(invalid.length, 0);
});