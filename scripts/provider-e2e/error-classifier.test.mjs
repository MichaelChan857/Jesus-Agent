import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyError } from "./error-classifier.mjs";

test("401 shouldRetry=false (single retry handled upstream)", () => {
  const c = classifyError({ status: 401 });
  assert.equal(c.kind, "AUTH");
  assert.equal(c.shouldRetry, false);
});

test("429 shouldRetry=true with backoff", () => {
  const c = classifyError({ status: 429 });
  assert.equal(c.kind, "RATE_LIMIT");
  assert.equal(c.shouldRetry, true);
  assert.deepEqual(c.backoffMs, [2000, 4000, 8000]);
});

test("5xx shouldRetry=false (signal not noise)", () => {
  const c = classifyError({ status: 503 });
  assert.equal(c.kind, "SERVER");
  assert.equal(c.shouldRetry, false);
});

test("timeout maps to TIMEOUT", () => {
  const c = classifyError({ kind: "TIMEOUT" });
  assert.equal(c.kind, "TIMEOUT");
});