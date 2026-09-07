// scripts/check-session-isolation.mjs
//
// Pre-commit / pre-merge gate that fails (commit) or warns (merge) when
// a session is about to commit a file another registered session owns.
//
// The check() function is the testable pure unit; the CLI block at the
// bottom wires it to git + the registry. Cross-session attribution is
// best-effort at the CLI layer — it depends on the caller populating
// otherOwnedBySession. The unit tests pass that map explicitly; the
// hook integration is left as a future enhancement once we add a
// per-session owned-file registry.
//
// Plan deviations vs docs/.../§B2:
//   - Test imports hoisted to the top (plan put them at the bottom).
//   - check() checks others[f] BEFORE ownedSet.has(f). Plan's order was
//     EXEMPT → ownedSet → others, which makes test 'FAIL: staged file
//     owned by another registered session' always PASS: the test puts
//     "foo.ts" in BOTH ownedFiles AND otherOwnedBySession, and the
//     ownedSet check would fire first. The intent of the test (and of
//     spec §3.B.4) is that an external coordination signal beats local
//     self-report: if another session registered this file, the
//     current session's claim is irrelevant.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { ensure, readAll } from "./session-registry.mjs";

const EXEMPT = new Set(["package-lock.json", "models.generated.ts"]);

function listOwned(cwd) {
  let tracked = "";
  let untracked = "";
  try {
    tracked = execFileSync("git", ["diff", "--name-only", "HEAD"], {
      cwd,
      encoding: "utf8",
    });
  } catch {
    // no HEAD yet
  }
  try {
    untracked = execFileSync(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      { cwd, encoding: "utf8" },
    );
  } catch {}
  return [
    ...new Set(
      [...tracked.split("\n"), ...untracked.split("\n")].filter(Boolean),
    ),
  ];
}

function listStaged(cwd) {
  try {
    return execFileSync("git", ["diff", "--cached", "--name-only"], {
      cwd,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Pure check function.
 *
 * @param {object} args
 * @param {"commit"|"merge"} args.mode
 * @param {string} args.sessionId          — current session id
 * @param {string} args.registryPath       — path to registry.jsonl (unused by check() itself, kept for symmetry)
 * @param {string} args.cwd                — current working dir (unused by check(), kept for symmetry)
 * @param {string[]} [args.stagedFiles]    — files to check; defaults to git diff --cached --name-only
 * @param {string[]} [args.ownedFiles]     — current session's owned set; defaults to git ls-files
 * @param {Record<string,string>} [args.otherOwnedBySession] — file → sessionId, populated by hook integration
 * @returns {{ verdict: "PASS"|"FAIL"|"WARN", reason?: string }}
 */
export function check({
  mode,
  sessionId,
  stagedFiles,
  ownedFiles,
  otherOwnedBySession,
} = {}) {
  const files = stagedFiles ?? [];
  const owned = ownedFiles ?? [];
  const ownedSet = new Set(owned);
  const others = otherOwnedBySession ?? {};

  for (const f of files) {
    if (EXEMPT.has(f)) continue;
    // Coordination signal wins: if another session registered this file,
    // surface it regardless of what the current session claims.
    if (others[f] && others[f] !== sessionId) {
      const reason = `file "${f}" is owned by session "${others[f]}"`;
      return { verdict: mode === "commit" ? "FAIL" : "WARN", reason };
    }
    if (ownedSet.has(f)) continue;
    // unknown / unregistered file → PASS per spec §3.B.6
  }
  return { verdict: "PASS" };
}

if (
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`
) {
  const mode = process.argv.includes("--mode=merge") ? "merge" : "commit";
  const cwd = process.cwd();
  const regPath = `${cwd}/.jesus/sessions/registry.jsonl`;
  const rec = ensure({ cwd, registryPath: regPath });
  const staged = listStaged(cwd);
  const owned = listOwned(cwd);
  // Best-effort cross-session attribution: with the current registry
  // schema we don't store per-session file lists, so we cannot attribute
  // a file to a specific other session. Pass an empty map; the check
  // will PASS unless someone wires up a richer registry.
  const all = readAll(regPath);
  void all;
  void existsSync;
  const otherOwnedBySession = {};
  const res = check({
    mode,
    sessionId: rec.id,
    stagedFiles: staged,
    ownedFiles: owned,
    otherOwnedBySession,
  });
  if (res.verdict === "FAIL") {
    console.error(`session isolation: ${res.reason}`);
    process.exit(1);
  } else if (res.verdict === "WARN") {
    console.warn(
      `session isolation warning: ${res.reason ?? "cross-session files"}`,
    );
    process.exit(0);
  }
  process.exit(0);
}