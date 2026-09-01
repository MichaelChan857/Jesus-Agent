# Jesus Agent — Engineering Productivity Improvements (Route A)

**Spec date**: 2026-08-31
**Status**: design-approved, awaiting implementation plan
**Owner**: jesus-agent maintainer (single-dev)
**Fork**: `earendil-works/pi` @ `853a80d2`, rebranded as `@jesus/*`

## 0. Summary

Three coordinated improvements that turn "merge upstream" from a quarterly
risk into a daily-stable operation:

1. **Provider e2e harness** — signal layer. Detects upstream LLM-provider
   protocol changes the moment `merge upstream` lands.
2. **Git multi-session safety net** — boundary layer. Prevents concurrent
   jesus-agent sessions from clobbering each other's commits.
3. **Pre-release smoke pack** — exit layer. Catches "package builds but
   doesn't actually work" failures before the release tag goes out.

The three are different projections of the same infrastructure (signal /
boundary / exit) and share the same constraint set; this spec covers them
in three sections that share section §1 (invariants).

## 1. Invariants — what this spec must NOT change

The six invariants below were approved 2026-08-30 and must hold across
every commit produced by this work:

- **I-1**: Public exports of `@jesus/coding-agent`, `@jesus/ai`,
  `@jesus/agent-core`, `@jesus/tui`, `@jesus/telemetry` are untouched.
- **I-2**: `PI_*` env-var public contract (README §Permissions) is untouched.
- **I-3**: `scripts/rebrand.mjs`, `scripts/rename-jesus.mjs`, and the
  `.jesus/` path are untouched.
- **I-4**: All five `check:*` scripts (`check:pinned-deps`,
  `check:shrinkwrap`, `check:install-lock:coding-agent`,
  `check:ts-imports`, `check:browser-smoke`) continue to pass.
- **I-5**: Release flow goes through `npm run release:patch` /
  `release:minor` (no custom publish path).
- **I-6**: No new npm dependency is added without updating
  `package-lock.json` (via `PI_ALLOW_LOCKFILE_CHANGE=1` per AGENTS.md §49)
  and regenerating `packages/coding-agent/npm-shrinkwrap.json`.

## 2. Section A — Provider e2e harness

### 2.A.1 Goals

- Catch upstream provider-protocol regressions within one CI cycle.
- Provide a reusable test bed that any new provider PR can plug into
  with `provider.mjs` + scenarios.
- Run **fast** in faux mode locally (no network), **real** in CI with
  secret-loaded API keys.

### 2.A.2 File layout

```
scripts/provider-e2e/
  ├─ runner.mjs            # CLI entry: --provider --scenario --reporter
  ├─ providers/
  │   ├─ minimax.mjs
  │   ├─ minimax-cn.mjs
  │   ├─ anthropic.mjs
  │   └─ openai.mjs
  ├─ scenarios/
  │   ├─ simple-stream.test.mjs
  │   ├─ tool-call.test.mjs
  │   ├─ multi-turn-thinking.test.mjs
  │   ├─ cache-hit.test.mjs
  │   └─ 401-retry.test.mjs
  └─ README.md

scripts/provider-e2e/runner.test.mjs              # unit test
scripts/provider-e2e/providers/faux-integration.test.mjs  # faux path only
```

### 2.A.3 Scenario contract

Each scenario file **must** export a default object:

```js
export default {
  name: "simple-stream",
  providers: ["anthropic", "openai", "minimax"],
  timeoutMs: 30000, // optional, defaults to 30000
  async run(provider) { /* throws on failure */ }
}
```

`runner.mjs` discovers scenarios via `tinyglobby` and dispatches per
`(provider, scenario)` pair through `p-limit` (concurrency = 4).

### 2.A.4 Provider module contract

Each `providers/<name>.mjs` exports:

```js
export const name = "anthropic";
export function isConfigured() { return Boolean(process.env.PI_ANTHROPIC_API_KEY); }
export async function send(prompt, opts) { /* returns { text, usage } */ }
```

When `isConfigured()` returns false, the runner falls back to the shared
`packages/ai/src/providers/faux.ts` (reused, not re-implemented).

### 2.A.5 Error handling (per decision E1/E2)

| Failure | Behavior |
|---|---|
| Scenario timeout | Mark `TIMEOUT`, continue, no retry |
| Provider 401 / 403 | Retry 1× after key refresh hint, then fail |
| Provider 429 | Exponential backoff (2s / 4s / 8s, max 3×), then fail |
| Provider 5xx | **No retry** — 5xx is the signal, not noise |
| Faux contract mismatch | Hard fail (this is a spec bug, not a network issue) |
| Runner crash | Exit 2 + write `runner.log` under `.artifacts/` |

### 2.A.6 Outputs

- Exit code `0` / `1` / `2` for CI.
- JUnit XML to `.artifacts/provider-e2e/{timestamp}/report.xml`
  (already in `.gitignore`).
- Console summary when `--reporter=console` (default).

### 2.A.7 Dependencies (per decision A2)

Approved additions, all pinned to a specific version via
`check:pinned-deps`:

- `yargs` (CLI parsing)
- `tinyglobby` (scenario discovery)
- `p-limit` (concurrency)

No other new deps. If implementation discovers a need for more, this
spec must be amended before adding them.

## 3. Section B — Git multi-session safety net

### 3.B.1 Problem statement

`AGENTS.md` §Git (lines 53–65) already documents the multi-session
discipline manually. Today, enforcement is *only* a code-review
convention. We automate the boundary without removing the discipline
section.

### 3.B.2 File layout

```
scripts/session-registry.mjs              # append-only JSONL store
scripts/check-session-isolation.mjs       # pre-commit / pre-merge gate
scripts/session-registry.test.mjs         # unit
scripts/check-session-isolation.test.mjs  # unit (uses temp git repo)
scripts/integration/multi-session-collision.test.mjs  # integration

.husky/pre-commit          # extended (append check-session-isolation)
.husky/pre-merge-commit    # NEW (warning-only)

.jesus/sessions/.gitignore  # ensure runtime data is not committed

scripts/integration/
  ├─ multi-session-collision.test.mjs      # two SESSION_IDs collide on commit
  └─ upstream-merge-rehearsal.test.mjs     # manual run; simulates "merge upstream" + runs §2.A
```

### 3.B.3 Registry format

Path: `.jesus/sessions/registry.jsonl` (appended, never rewritten).

```jsonl
{"id":"sess-abc123","cwdHash":"a1b2c3d4e5f6","cwd":"/path/to/cwd","startedAt":1735660800000,"pid":12345}
{"id":"sess-def456","cwdHash":"9z8y7x6w5v4u","cwd":"/other/cwd","startedAt":1735660900000,"pid":12346}
```

`session-registry.mjs ensure` reads `$SESSION_ID` (auto-derives if unset:
`$RANDOM` + first 12 hex of `sha1(cwd)`) and appends a single line.

### 3.B.4 Pre-commit gate (per decision C1: hard stop)

`check-session-isolation.mjs` runs in `.husky/pre-commit`:

1. Read current `SESSION_ID`. If unset → derive + register (auto, no error).
2. Read `git diff --cached --name-only` (staged files).
3. Compute "owned files" = files this session has actually modified
   in the working tree: union of `git diff --name-only HEAD` (tracked
   changes) and `git ls-files --others --exclude-standard` (untracked,
   non-`.gitignore`d).
4. For each staged file:
   - If in `{package-lock.json, models.generated.ts}` → PASS
     (AGENTS.md §Git explicit exemption).
   - If in this session's owned set → PASS.
   - If in another **registered** session's owned set → **FAIL**
     (exit 1, print "file X is owned by session Y").
   - Otherwise → PASS (unknown / unregistered — per decision E1, do not
     false-positive on legitimate new files).

### 3.B.5 Pre-merge gate (per decision C1: warn only)

Same script, `--mode=merge` flag:

- Identical checks, but on `git diff --name-only HEAD~1..HEAD`.
- Failures are written to `.jesus/sessions/merge-warnings.log` (gitignored)
  and printed; **no exit 1**.

### 3.B.6 Failure semantics (per decision E1)

| Scenario | Outcome |
|---|---|
| `SESSION_ID` unset + registry write fails | Soft warn, commit proceeds (fallback to AGENTS.md manual discipline) |
| `registry.jsonl` corrupt | Backup as `registry.jsonl.bak.{ts}`, recreate empty, warn |
| Unknown file (not in any session) | PASS |
| Owned by another registered session | FAIL (pre-commit) / WARN (pre-merge) |
| File in {lockfile, models.generated} | Always PASS |

### 3.B.7 What this section does NOT do

- Does not replace AGENTS.md §Git. The manual discipline stays.
- Does not block `-A` / `.` git-add if no other session is registered
  (consistent with E1).
- Does not run network calls.

## 4. Section C — Pre-release smoke pack

### 4.C.1 Goals

- Detect "package builds but doesn't work" failures before tag push.
- Reuse `scripts/local-release.mjs` artifact directory; do not fork.
- Run **both Node and Bun** runtime paths; both `--help`, `--version`,
  `--list-models`, and `-p "ok"`.
- Run **real provider** smoke by default (per decision D1), with
  explicit `--skip-real-provider` escape hatch.

### 4.C.2 File layout

```
scripts/release-smoke.mjs                 # NEW (reuses local-release output)
scripts/release-smoke.test.mjs            # NEW (uses mock pi binary)

.github/workflows/release-smoke.yml       # NEW (tag push only)

package.json:
  + "release:smoke": "node scripts/release-smoke.mjs"
  + "prepublishOnly": "...existing... && npm run release:smoke"
```

### 4.C.3 CLI

```
node scripts/release-smoke.mjs [options]

  --skip-bun              Skip Bun runtime path (warn if Bun not present)
  --skip-real-provider    Skip -p "ok" real-provider call
  --out <dir>             Override artifact dir (default: os.tmpdir()/pi-local-release)
```

### 4.C.4 Smoke matrix

Each cell runs **serially** to avoid provider rate-limit collisions:

```
Runtime \ Command        --help  --version  --list-models  -p "ok" (real)
Node                      ✓       ✓           ✓              ✓ (default)
Bun                       ✓       ✓           ✓              ✓ (default)
```

8 cells = 8 cases. `--skip-bun` reduces to 4, `--skip-real-provider`
reduces to 6.

### 4.C.5 Path handling (per decision D2)

Use `os.tmpdir()`:

- Linux: `/tmp/pi-local-release/`
- Windows: `%LOCALAPPDATA%\Temp\pi-local-release\` (resolved at runtime
  by `os.tmpdir()` to e.g. `C:\Users\xxx\AppData\Local\Temp\pi-local-release\`)

Document the mapping in `scripts/release-smoke.mjs` header so anyone
running it understands where artifacts land on each platform.

### 4.C.6 Failure semantics

| Stage | Behavior |
|---|---|
| `local-release` artifacts missing | Auto-invoke `local-release.mjs --out <dir> --force`; if that fails, hard fail |
| Bun runtime missing + `--skip-bun` not passed | Warn + skip Bun cells; continue with Node-only smoke |
| `--help` / `--version` / `--list-models` fail | **Hard fail immediately**, skip remaining |
| `-p "ok"` 5xx | Hard fail (no retry — signal, not noise, same as §2.A.5) |
| `-p "ok"` 429 | One exponential backoff, then fail |
| CI fail (tag push) | Block tag push via workflow job fail; do NOT auto-rollback tag (per README §Releasing "If CI publish or announcement fails") |

### 4.C.7 CI integration

`release-smoke.yml` triggers on:

- `push` tag matching `v*` (release-tag smoke)
- Manual `workflow_dispatch`

Does **not** trigger on PR or non-tag main push (those run §2.A e2e in CI
but not §4.C smoke — too slow).

Secrets required: `PI_<PROVIDER>_API_KEY` per enabled provider.

### 4.C.8 Real-provider default (per decision D1)

By default **both** local and CI runs `npm run release:smoke` against a
real provider using whatever `PI_<PROVIDER>_API_KEY` is present in the
environment. This is the user's explicit override of the default advice.
- Cost: each release-smoke run costs roughly one provider request.
- Mitigation: `--skip-real-provider` escape hatch always available.
- Documentation: prominent note in `scripts/release-smoke.mjs` header
  and `README.md` §Releasing.

## 5. Cross-section: dependencies & test boundaries

### 5.1 Shared dependency choices

Both §2 (e2e) and §4 (smoke) need CLI parsing and async concurrency.
Approved shared deps (per A2, pinned to exact versions):

- `yargs` — CLI parsing
- `p-limit` — concurrency (e2e runner, smoke matrix)
- `tinyglobby` — scenario discovery (e2e only)

If §4 smoke needs globbing later, add `tinyglobby` to its imports too
(separate `import` per file is fine; dep is already approved).

### 5.2 Test layering

| Layer | Tool | Where |
|---|---|---|
| Script unit tests | `node --test scripts/*.test.mjs` | Project root (already wired) |
| Provider faux tests | `node --test` | Same harness |
| Integration (multi-session) | `node --test` | `scripts/integration/` |
| Real-provider e2e (per F2) | faux locally; CI on `PI_*_API_KEY` | CI only |
| Upstream-merge rehearsal | Manual run | `scripts/integration/upstream-merge-rehearsal.test.mjs` (per F1) |

`./test.sh` continues to skip LLM-dependent tests unless API keys are
present — this is unchanged. New `provider-e2e` tests **must not** opt
out of `./test.sh`; if a test needs network, it must check `isConfigured()`
first and `t.skip` otherwise.

### 5.3 CI matrix (per decision F1/F2)

- PR: run §2.A unit + integration + faux path; skip §4.C
- main push: same as PR + §4.C smoke if secrets present
- tag push: run all of the above + §4.C smoke (mandatory)
- `upstream-merge-rehearsal.test.mjs` is **manual-only**; not on any CI
  trigger. Run locally with `node scripts/integration/upstream-merge-rehearsal.test.mjs`
  before proposing an upstream merge.

## 6. Out of scope (explicitly)

- **TUI snapshot testing** — separate initiative, internal to UI layer.
- **Upstream merge automation** — this spec only adds signal so a human
  can react faster; it does not auto-resolve conflicts.
- **Provider additions** — this spec ships with 4 providers (anthropic,
  openai, minimax, minimax-cn); adding more is a separate PR.
- **Permission system** — Jesus Agent has no built-in permission system
  per README; this spec does not add one.

## 7. Open questions deferred to implementation plan

These are flagged for the `writing-plans` skill to resolve:

- Exact `yargs` / `p-limit` / `tinyglobby` version pins (must satisfy
  `check:pinned-deps` and `shrinkwrap` regen).
- Specific JUnit XML schema (most use `junit-xml` style; details TBD).
- Mock pi binary content for `release-smoke.test.mjs`.

## 8. Acceptance criteria

The work is "done" when:

1. `npm run check` still passes (no I-4 regression).
2. `npm run test:scripts` covers all new `*.test.mjs` files.
3. `npm run release:smoke --skip-bun` runs locally on Windows and Linux.
4. `npm run release:smoke` (with `PI_<PROVIDER>_API_KEY`) succeeds.
5. `git commit` with a file owned by another `SESSION_ID` fails with a
   clear error pointing to the owning session.
6. `git merge` produces a `.jesus/sessions/merge-warnings.log` line for
   any cross-session file in the merged diff.
7. CI release-smoke workflow blocks a tag push when smoke fails.
8. No public API surface changed (grep diff confirms).

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| `p-limit` / `yargs` are unmaintained | Pin to a recent version; AGENTS.md policy: never modify to fix outdated dep — upgrade instead |
| session-registry JSONL grows unbounded | Add rotation: every commit, archive entries older than 30 days to `.jesus/sessions/archive/` (gitignored) |
| `release-smoke` real-provider calls cost money | `--skip-real-provider` flag, prominent in README |
| Pre-commit hook slows down commits | `check-session-isolation` < 100ms typical; benchmark in test |
| New deps break `check:pinned-deps` | Spec lists every dep; adding unlisted deps = spec amendment required |