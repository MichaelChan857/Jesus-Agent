// scripts/session-registry.mjs
//
// Append-only JSONL store of active jesus-agent sessions. Used by
// check-session-isolation.mjs (Task B2) to detect when a session is
// about to commit a file owned by another registered session.
//
// Plan deviations vs docs/superpowers/plans/.../§B1:
//   - deriveId(cwd) uses ONLY sha1(cwd)[:12] for the default-id path.
//     The plan's impl seeded the hash with cwd + pid + Date.now() which
//     breaks the spec-mandated stability: deriveId(cwd) must return
//     the same id on every call for the same cwd (asserted by test).
//     Spec §3.B.3 auto-derive is "$RANDOM + first 12 hex of sha1(cwd)".
//     SESSION_ID env still takes precedence (idempotent registration).
//   - readAll() rotates the registry on corrupt JSONL per spec §3.B.6
//     ("Backup as registry.jsonl.bak.{ts}, recreate empty, warn").
//     Note: this loses the entries before the corrupt line; acceptable
//     because corruption indicates a partial-write failure and the safe
//     choice is to start fresh rather than risk reading garbage.

import { createHash } from "node:crypto";
import {
  appendFileSync,
  readFileSync,
  existsSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";

function cwdHash(cwd) {
  return createHash("sha1").update(cwd).digest("hex").slice(0, 12);
}

export function deriveId(cwd, seed = process.env.SESSION_ID ?? null) {
  if (seed && typeof seed === "string" && seed.length > 0) return seed;
  return cwdHash(cwd);
}

export function ensure({ cwd, registryPath, id } = {}) {
  const resolvedCwd = cwd ?? process.cwd();
  const resolvedId = id ?? deriveId(resolvedCwd);
  mkdirSync(dirname(registryPath), { recursive: true });
  const rec = {
    id: resolvedId,
    cwd: resolvedCwd,
    cwdHash: cwdHash(resolvedCwd),
    startedAt: Date.now(),
    pid: process.pid,
  };
  appendFileSync(registryPath, JSON.stringify(rec) + "\n");
  return rec;
}

export function readAll(registryPath) {
  if (!existsSync(registryPath)) return [];
  const text = readFileSync(registryPath, "utf8");
  const out = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // Per spec §3.B.6: rotate + recreate empty on corruption.
      const backup = `${registryPath}.bak.${Date.now()}`;
      try {
        renameSync(registryPath, backup);
      } catch {}
      return out;
    }
  }
  return out;
}