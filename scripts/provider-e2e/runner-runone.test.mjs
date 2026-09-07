import { test } from "node:test";
import assert from "node:assert/strict";
import { runOne } from "./runner.mjs";

test("runOne invokes scenario.run(providerMod) and reports PASS on success", async () => {
  const calls = [];
  const providerMod = {
    name: "stub",
    isConfigured: () => true,
    send: async (prompt, opts) => {
      calls.push({ type: "send", prompt, opts });
      return { text: "hello", usage: { input: 1, output: 1 } };
    },
  };
  const scenario = {
    name: "spy",
    providers: ["stub"],
    run: async (p) => {
      calls.push({ type: "scenario-run", providerName: p.name });
    },
  };
  const r = await runOne("stub", scenario, /* fauxOnly */ false, providerMod);
  assert.equal(r.status, "PASS");
  assert.equal(r.scenario, "spy");
  assert.equal(
    calls.some((c) => c.type === "scenario-run" && c.providerName === "stub"),
    true,
  );
});

test("runOne reports FAIL when scenario.run throws", async () => {
  const providerMod = {
    name: "stub",
    isConfigured: () => true,
    send: async () => ({ text: "x", usage: { input: 0, output: 0 } }),
  };
  const scenario = {
    name: "boom",
    providers: ["stub"],
    run: async () => {
      throw new Error("scenario rejected response");
    },
  };
  const r = await runOne("stub", scenario, false, providerMod);
  assert.equal(r.status, "FAIL");
  assert.equal(r.scenario, "boom");
  assert.match(r.error, /scenario rejected response/);
});

test("runOne routes to faux when providerMod is unconfigured", async () => {
  const providerMod = {
    name: "anthropic",
    isConfigured: () => false,
    send: async () => ({ text: "should-not-be-called", usage: { input: 0, output: 0 } }),
  };
  const scenario = {
    name: "noop",
    providers: ["anthropic"],
    run: async () => {},
  };
  const r = await runOne("anthropic", scenario, false, providerMod);
  assert.equal(r.status, "FAUX");
});

test("runOne routes to faux when fauxOnly=true even if providerMod is configured", async () => {
  const providerMod = {
    name: "anthropic",
    isConfigured: () => true,
    send: async () => ({ text: "real", usage: { input: 0, output: 0 } }),
  };
  const scenario = {
    name: "noop",
    providers: ["anthropic"],
    run: async () => {
      throw new Error("scenario.run should not be called when fauxOnly");
    },
  };
  const r = await runOne("anthropic", scenario, /* fauxOnly */ true, providerMod);
  assert.equal(r.status, "FAUX");
});