import { test } from "node:test";
import assert from "node:assert/strict";
import * as minimax from "./minimax.mjs";

test("minimax reads PI_MINIMAX_API_KEY", () => {
  const orig = process.env.PI_MINIMAX_API_KEY;
  delete process.env.PI_MINIMAX_API_KEY;
  assert.equal(minimax.isConfigured(), false);
  process.env.PI_MINIMAX_API_KEY = "test-key";
  assert.equal(minimax.isConfigured(), true);
  if (orig === undefined) delete process.env.PI_MINIMAX_API_KEY;
  else process.env.PI_MINIMAX_API_KEY = orig;
});