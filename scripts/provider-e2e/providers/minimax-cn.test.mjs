import { test } from "node:test";
import assert from "node:assert/strict";
import * as cn from "./minimax-cn.mjs";

test("minimax-cn reads PI_MINIMAX_CN_API_KEY", () => {
  const orig = process.env.PI_MINIMAX_CN_API_KEY;
  delete process.env.PI_MINIMAX_CN_API_KEY;
  assert.equal(cn.isConfigured(), false);
  process.env.PI_MINIMAX_CN_API_KEY = "test-key";
  assert.equal(cn.isConfigured(), true);
  if (orig === undefined) delete process.env.PI_MINIMAX_CN_API_KEY;
  else process.env.PI_MINIMAX_CN_API_KEY = orig;
});