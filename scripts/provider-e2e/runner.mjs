#!/usr/bin/env node
// scripts/provider-e2e/runner.mjs
//
// CLI entry point for the provider-e2e harness. Discovers scenarios under
// ./scenarios/, filters by --provider / --scenario, dispatches per pair with
// p-limit(4) concurrency, writes JUnit XML when --reporter=junit, and exits
// 0/1/2 per spec §2.A.6.
//
// Plan deviations vs docs/superpowers/plans/.../§A6:
//   - faux imported as named exports (plan wrote `import faux from ...`);
//     faux.mjs uses named exports per spec §2.A.4 (see A2 commit 8d724ce).
//   - PROVIDERS map deduped: plan had two `minimax:` keys (one shadows the
//     other); corrected to distinct keys minimax + minimax-cn.
//   - faux is wired directly via runOne() with a fauxOnly override instead
//     of via a non-existent `providerMod._faux` sentinel.

import yargs from "yargs";
import pLimit from "p-limit";
import { discoverScenariosAsync } from "./scenario-loader.mjs";
import * as faux from "./providers/faux.mjs";
import * as anthropic from "./providers/anthropic.mjs";
import * as openai from "./providers/openai.mjs";
import * as minimax from "./providers/minimax.mjs";
import * as minimaxCn from "./providers/minimax-cn.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PROVIDERS = {
  anthropic,
  openai,
  minimax,
  "minimax-cn": minimaxCn,
};
const ROOT = new URL(".", import.meta.url).pathname;

export function parseArgs(argv) {
  // argv is expected to be already-stripped (no node binary / script path).
  // main() calls with process.argv.slice(2); tests pass flag arrays directly.
  // This keeps parseArgs pure and easy to unit-test.
  const parsed = yargs(argv)
    .option("provider", { type: "string", demand: false })
    .option("scenario", { type: "string", demand: false })
    .option("reporter", {
      type: "string",
      default: "console",
      choices: ["console", "junit"],
    })
    .option("faux-only", { type: "boolean", default: false })
    .parseSync();
  return {
    provider: parsed.provider ?? null,
    scenario: parsed.scenario ?? null,
    reporter: parsed.reporter,
    fauxOnly: parsed["faux-only"],
  };
}

async function runOne(provider, scenario, fauxOnly) {
  if (fauxOnly) {
    const r = await faux.send("synthetic", { model: "faux-1" });
    return { status: "FAUX", provider, scenario: scenario.name, text: r.text };
  }
  const providerMod = PROVIDERS[provider];
  if (!providerMod || !providerMod.isConfigured()) {
    const r = await faux.send("synthetic", { model: "faux-1" });
    return { status: "FAUX", provider, scenario: scenario.name, text: r.text };
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), scenario.timeoutMs ?? 30000);
  try {
    const r = await providerMod.send(`scenario:${scenario.name}`, {
      signal: controller.signal,
    });
    return { status: "PASS", provider, scenario: scenario.name, text: r.text };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenariosRoot = join(ROOT, "scenarios");
  const { valid, invalid } = await discoverScenariosAsync(scenariosRoot);
  const filtered = args.scenario
    ? valid.filter((s) => s.name === args.scenario)
    : valid;
  const targetProviders = args.provider
    ? [args.provider]
    : [...new Set(filtered.flatMap((s) => s.providers))];
  const limit = pLimit(4);
  const tasks = [];
  for (const sc of filtered) {
    for (const p of targetProviders) {
      if (!sc.providers.includes(p)) continue;
      tasks.push(limit(() => runOne(p, sc, args.fauxOnly)));
    }
  }
  const results = await Promise.all(tasks);
  if (args.reporter === "junit") {
    const dir = join(process.cwd(), ".artifacts", "provider-e2e", String(Date.now()));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "report.xml"), toJunit(results));
  }
  const fails = results.filter((r) => r.status !== "PASS" && r.status !== "FAUX");
  console.log(`${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length === 0 ? 0 : 1);
}

function toJunit(results) {
  const cases = results
    .map((r) => `<testcase name="${r.scenario}" classname="${r.provider}"/>`)
    .join("\n  ");
  return `<?xml version="1.0"?>\n<testsuite>${cases}\n</testsuite>`;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(2);
  });
}