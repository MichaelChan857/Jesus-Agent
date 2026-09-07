import { test } from "node:test";
import assert from "node:assert/strict";
import * as openai from "./openai.mjs";

test("openai reads PI_OPENAI_API_KEY", () => {
  const orig = process.env.PI_OPENAI_API_KEY;
  delete process.env.PI_OPENAI_API_KEY;
  assert.equal(openai.isConfigured(), false);
  process.env.PI_OPENAI_API_KEY = "sk-test";
  assert.equal(openai.isConfigured(), true);
  if (orig === undefined) delete process.env.PI_OPENAI_API_KEY;
  else process.env.PI_OPENAI_API_KEY = orig;
});

test("openai send throws on missing key", async () => {
  const orig = process.env.PI_OPENAI_API_KEY;
  delete process.env.PI_OPENAI_API_KEY;
  await assert.rejects(() => openai.send("hi"), /PI_OPENAI_API_KEY/);
  if (orig !== undefined) process.env.PI_OPENAI_API_KEY = orig;
});