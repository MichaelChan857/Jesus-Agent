// scripts/provider-e2e/scenario-loader.mjs
//
// Discovers provider-e2e scenarios under a directory tree by glob and
// validates each scenario's contract. The runner (scripts/provider-e2e/runner.mjs,
// introduced in Task A3) consumes the returned list.
//
// Contract for a scenario file:
//   - extension `.scenario.mjs`
//   - default export: `{ name: string, providers: string[], run: (ctx) => Promise<void>, timeoutMs?: number }`
//
// See spec §"Provider e2e harness" for the full contract and §"Scenario
// conventions" for naming. This loader is async-only; no sync variant —
// dynamic import() is fundamentally a Promise, and faking sync semantics
// via deasync has been removed in Node 22+.

import { glob } from "tinyglobby";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PATTERN = "**/*.scenario.mjs";

function validate(def) {
  return (
    def !== null &&
    typeof def === "object" &&
    typeof def.name === "string" &&
    def.name.length > 0 &&
    Array.isArray(def.providers) &&
    def.providers.length > 0 &&
    def.providers.every((p) => typeof p === "string") &&
    typeof def.run === "function"
  );
}

/**
 * Discover scenarios under `rootDir`.
 *
 * @param {string} rootDir - absolute path to search recursively
 * @returns {Promise<{ valid: Array<{ name: string, providers: string[], run: Function, timeoutMs?: number, _path: string }>, invalid: Array<{ path: string, reason: string }> }>}
 *
 * The loader is permissive about import failures: if a file fails to parse
 * or import, it is reported in `invalid` with the error message rather than
 * throwing. A single broken scenario must not block the others.
 */
export async function discoverScenariosAsync(rootDir) {
  const matches = await glob(PATTERN, { cwd: rootDir, onlyFiles: true });
  const valid = [];
  const invalid = [];

  for (const rel of matches) {
    const abs = join(rootDir, rel);
    // Node 22+ ESM loader requires file:// URLs for dynamic import on
    // Windows; bare paths like 'C:/...' throw ERR_UNSUPPORTED_ESM_URL.
    const url = pathToFileURL(abs).href;
    let mod;
    try {
      mod = await import(url);
    } catch (error) {
      invalid.push({
        path: abs,
        reason: `import failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    if (validate(mod.default)) {
      valid.push({ ...mod.default, _path: abs });
    } else {
      invalid.push({ path: abs, reason: "missing name/providers/run" });
    }
  }

  return { valid, invalid };
}