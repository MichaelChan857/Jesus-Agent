import { test } from "node:test";
import assert from "node:assert/strict";
import * as faux from "./faux.mjs";

test("faux provider is always configured", () => {
  assert.equal(faux.isConfigured(), true);
  assert.equal(faux.name, "faux");
});

test("faux provider send returns deterministic shape", async () => {
  const r = await faux.send("hello", { model: "faux-1" });
  assert.equal(typeof r.text, "string");
  assert.ok(r.text.length > 0);
  assert.equal(r.usage.input, 1);
  assert.equal(r.usage.output, 1);
});