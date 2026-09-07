import { test } from "node:test";
import assert from "node:assert/strict";
import * as anthropic from "./anthropic.mjs";

test("anthropic provider reads PI_ANTHROPIC_API_KEY", () => {
  const orig = process.env.PI_ANTHROPIC_API_KEY;
  delete process.env.PI_ANTHROPIC_API_KEY;
  assert.equal(anthropic.isConfigured(), false);
  process.env.PI_ANTHROPIC_API_KEY = "sk-test";
  assert.equal(anthropic.isConfigured(), true);
  if (orig === undefined) delete process.env.PI_ANTHROPIC_API_KEY;
  else process.env.PI_ANTHROPIC_API_KEY = orig;
});

test("anthropic send throws on missing key", async () => {
  const orig = process.env.PI_ANTHROPIC_API_KEY;
  delete process.env.PI_ANTHROPIC_API_KEY;
  await assert.rejects(() => anthropic.send("hi"), /PI_ANTHROPIC_API_KEY/);
  if (orig !== undefined) process.env.PI_ANTHROPIC_API_KEY = orig;
});