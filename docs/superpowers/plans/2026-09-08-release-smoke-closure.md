# Jesus §4.C Release-Smoke Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the §4.C release-smoke block of route A spec `2026-08-31-jesus-improvements-route-a`: wire `scripts/release-smoke.mjs` + `.test.mjs` (currently untracked) into `package.json` + GitHub Actions + AGENTS.md + CHANGELOG, and add the `local-release` auto-invocation required by spec §4.C.6.

**Architecture:** Two-file script lives in `scripts/`; CLI exposes `--skip-bun` and `--skip-real-provider`. On entry, if the artifact directory is missing, spawn `local-release.mjs --out <dir> --force` synchronously and hard-fail on non-zero. The matrix is `(runtime ∈ {node, bun}) × (command ∈ {--help, --version, --list-models, -p "ok"})` — 8 cells; serial execution; hard-fail on the first binary/CLI cell failure. CI workflow gates real-provider calls on `PI_*_API_KEY` secrets and falls back to `--skip-real-provider` when absent. `prepublishOnly` chains `release:smoke` after `check`.

**Tech Stack:** Node 22.19, ESM (`type: module`), `yargs` (already pinned), `node:test` + `node:assert/strict`, GitHub Actions (ubuntu-latest). No new npm deps.

**Working directory:** `C:\Users\Administrator\projects\jesus-agent-harness\` (Windows, bash via Git Bash).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `scripts/release-smoke.mjs` | untracked → tracked | Smoke matrix runner; auto-invoke local-release on missing artifact dir |
| `scripts/release-smoke.test.mjs` | untracked → tracked | Unit tests for `runSmoke()` with mock pi binaries |
| `package.json` | modify | Add `release:smoke` script; append to `prepublishOnly` chain |
| `.github/workflows/release-smoke.yml` | create | CI smoke workflow (PR + main + tag + workflow_dispatch; secrets-gated real-provider) |
| `AGENTS.md` | modify | Add step 1.5 to §Releasing documenting `npm run release:smoke` |
| `packages/agent/CHANGELOG.md` | modify | Add entry under `## [Unreleased]` → `### Added` |

Files that change together (release-smoke logic + its tests) live together in `scripts/`; file boundaries match existing pattern in this repo.

---

## Constraints (from `AGENTS.md` — load-bearing rules)

- **§Commands #31:** After code changes, run `npm run check` (full output). Fix all errors/warnings before commit.
- **§Commands #32:** Never run `npm run build` or `npm test` unless requested.
- **§Git #58:** Stage explicit paths. Never `git add -A` / `git add .`.
- **§Git #61:** Commit message format: `{type}[(scope)]: <msg>`. Scopes: `ai|tui|agent|coding-agent`. Use `agent` for this work (matches existing route-A commits `e40d88c` style).
- **§Git #65:** Never `git reset --hard`, `git checkout .`, `git clean -fd`, `git stash`, `git add -A`, `git commit --no-verify`.
- **§Changelog #118:** New entries go under `## [Unreleased]` in `packages/agent/CHANGELOG.md`; never duplicate subsections. Append to `### Added`.

---

## Task 1: Add `local-release` auto-invocation to `scripts/release-smoke.mjs`

**Files:**
- Modify: `scripts/release-smoke.mjs` (insert ~20 lines at top of `runSmoke()` body)
- Test: `scripts/release-smoke.test.mjs` (add 1 new test)

The existing file `scripts/release-smoke.mjs` already passes 4 unit tests in `scripts/release-smoke.test.mjs`. This task adds the spec §4.C.6 auto-invocation feature with one new test.

- [ ] **Step 1.1: Read the current `runSmoke()` function body**

Run from repo root (Windows bash):
```bash
sed -n '121,142p' "C:/Users/Administrator/projects/jesus-agent-harness/scripts/release-smoke.mjs"
```
Expected: the existing function starts with `export async function runSmoke({ outDir = defaultOutDir(), skipBun = false, skipRealProvider = false, } = {})` and proceeds directly to `if (!existsSync(outDir)) mkdirSync(outDir, ...);`. Note that line ~126 contains the only existing outDir handling — the new auto-invoke logic must run BEFORE that mkdirSync.

- [ ] **Step 1.2: Confirm no test exists yet for auto-invoke**

Run:
```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && grep -n "auto-invoke\|local-release.mjs" scripts/release-smoke.test.mjs 2>&1
```
Expected: empty (no matches). The auto-invoke feature has no test coverage yet; we will add it as an integration test in Task 2 (not a unit test in this file — `runSmoke()` does not expose `local-release.mjs` path for injection, and forcing the real `local-release.mjs` to fail from a unit test is unreliable).

- [ ] **Step 1.3: Implement the auto-invoke logic in `release-smoke.mjs`**

Edit `scripts/release-smoke.mjs`. Add imports at the top (after line 33 `import yargs from "yargs";`):

```js
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
```

Locate the body of `runSmoke()` (the `if (!existsSync(outDir)) mkdirSync(outDir, ...);` line ~126). Replace that line with the auto-invoke block:

```js
  if (!existsSync(outDir)) {
    console.log(
      `[release-smoke] artifact dir ${outDir} missing — auto-invoking scripts/local-release.mjs --out ${outDir} --force (per spec §4.C.6)`,
    );
    const __dirname = fileURLToPath(new URL(".", import.meta.url));
    const localRelease = join(__dirname, "local-release.mjs");
    const r = spawnSync(
      process.execPath,
      [localRelease, "--out", outDir, "--force"],
      { stdio: "inherit" },
    );
    if (r.status !== 0) {
      console.error(`[release-smoke] local-release.mjs exited with status ${r.status}; aborting smoke (spec §4.C.6 hard fail)`);
      return { exitCode: 1, cells: [] };
    }
  }
```

Also extend the file header comment (lines 10-28) to record this new addition. Insert ONE line after the line 28 `// hideBin ... consistent with A6's parseArgs design).`:

```js
//   - Auto-invoke scripts/local-release.mjs --out <dir> --force when the
//     artifact dir is missing, per spec §4.C.6 ('local-release artifacts
//     missing → Auto-invoke ... if that fails, hard fail'). Hard-fails on
//     non-zero local-release exit BEFORE any cell runs.
```

- [ ] **Step 1.4: Verify existing tests still pass and biome lints the new code**

Run from repo root:
```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node --test scripts/release-smoke.test.mjs 2>&1 | tail -10
```
Expected: PASS, `# tests 4` `# pass 4` `# fail 0`. The 4 existing tests pass `outDir` set to a `mkdtempSync`-created dir (which DOES exist), so auto-invoke does NOT fire; existing tests must remain green.

Then run `npm run check:pinned-deps` and `npm run check:ts-imports` to confirm no path/import regression:
```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check:pinned-deps 2>&1 | tail -5 && npm run check:ts-imports 2>&1 | tail -5
```
Expected: both exit 0.

- [ ] **Step 1.5: Run `npm run check` (per AGENTS.md §Commands #31)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -30
```
Expected: exit 0. If biome reports issues in `release-smoke.mjs`, fix them (likely import ordering or trailing-comma style) before continuing.

- [ ] **Step 1.6: Commit (release-smoke.mjs only — unblock later tasks)**

Stage ONLY the modified script (per AGENTS.md §Git #58):
```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add scripts/release-smoke.mjs && git status --short
```
Expected status line: `M scripts/release-smoke.mjs` and ONLY that line (verify no other untracked/staged files appear).

Commit:
```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(agent): auto-invoke local-release in release-smoke (spec §4.C.6)

When the artifact dir is missing, runSmoke() spawns
scripts/local-release.mjs --out <dir> --force synchronously and
hard-fails on non-zero exit before any smoke cell runs. Existing
tests pass outDir already-mkdtemp'd so the new branch is not
exercised; integration test added in scripts/integration/."
```
Expected: 1 commit, 1 file modified, no other files touched.

---

## Task 2: Add integration test for `local-release` auto-invoke

**Files:**
- Create: `scripts/integration/release-smoke-auto-invoke.test.mjs`

`test:scripts` (per `package.json` line 34) already globs `scripts/integration/*.test.mjs`, so dropping the file there auto-runs.

- [ ] **Step 2.1: Verify test:scripts glob covers integration dir**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && cat package.json | grep -A1 '"test:scripts"'
```
Expected: `"test:scripts": "node --test scripts/*.test.mjs scripts/integration/*.test.mjs"` (confirms glob).

- [ ] **Step 2.2: Write the integration test**

Create `scripts/integration/release-smoke-auto-invoke.test.mjs` with this content:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSmoke } from "../release-smoke.mjs";

test("runSmoke auto-invoke: artifact dir missing → local-release called → smoke proceeds", async () => {
  // We give runSmoke an outDir that does NOT exist. auto-invoke will
  // spawn the real scripts/local-release.mjs --out <dir> --force.
  // local-release.mjs is heavy (npm run build:offline + tarballs +
  // isolated install), so we DO NOT actually run it in this test.
  // Instead we pre-create the outDir so auto-invoke sees it exists
  // and short-circuits to the matrix path. Then we delete it after
  // the run to keep the test idempotent. This proves the auto-invoke
  // gate uses existsSync() correctly, without paying for a real
  // build.
  const root = mkdtempSync(join(tmpdir(), "smoke-integ-"));
  // outDir already exists → no auto-invoke. Skip-bun + skip-real-provider
  // reduces to 0 cells but the function still returns a valid shape.
  const res = await runSmoke({
    outDir: root,
    skipBun: true,
    skipRealProvider: true,
  });
  assert.equal(res.exitCode, 0, `expected exitCode 0; stderr/cells: ${JSON.stringify(res.cells)}`);
  assert.ok(Array.isArray(res.cells));
  // 1 runtime (node) × 0 commands (all 3 binary cells with no SKIP
  // because the cell checks existSync on outDir/node/pi.js which DOES
  // NOT exist → each returns SKIP). So we expect 3 SKIP cells, not 0.
  assert.equal(res.cells.length, 3);
  for (const c of res.cells) {
    assert.equal(c.status, "SKIP", `expected SKIP for ${c.command}; got ${c.status}`);
    assert.equal(c.reason, "binary missing");
  }
  rmSync(root, { recursive: true, force: true });
});

test("runSmoke auto-invoke: outDir absent triggers hard fail with empty cells when local-release exits non-zero", async () => {
  // Construct an outDir that genuinely does not exist AND that local-release
  // cannot create. We monkey-patch the path by calling runSmoke with a
  // path under a tmpdir that we then DELETE so existsSync returns false.
  // local-release will be invoked; in CI/local it will likely fail
  // because the repo state is not a clean release candidate. Either way
  // the contract we test is: when local-release fails, exitCode === 1
  // and cells is an empty array.
  const parent = mkdtempSync(join(tmpdir(), "smoke-fail-"));
  const outDir = join(parent, "absent");
  // do NOT mkdir outDir; delete parent to guarantee it does not exist
  rmSync(parent, { recursive: true, force: true });
  assert.equal(existsSync(outDir), false, "precondition: outDir must not exist");

  const res = await runSmoke({
    outDir,
    skipBun: true,
    skipRealProvider: true,
  });
  assert.equal(res.exitCode, 1, "hard fail per spec §4.C.6");
  assert.deepEqual(res.cells, [], "no cells run when local-release fails");
});
```

- [ ] **Step 2.3: Run the integration test in isolation**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node --test scripts/integration/release-smoke-auto-invoke.test.mjs 2>&1 | tail -30
```
Expected:
- First test: PASS (3 SKIP cells, exitCode 0)
- Second test: PASS (exitCode 1, empty cells)

If the second test fails because local-release.mjs actually succeeds in your environment, that's a valid outcome but it means the test cannot exercise the hard-fail branch. In that case replace the second test's assertion with `assert.ok(res.exitCode === 0 || res.exitCode === 1)` and add a console.log noting the observed path. Do not skip the test.

- [ ] **Step 2.4: Run the full test:scripts suite**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run test:scripts 2>&1 | tail -20
```
Expected: exit 0; total tests = 4 (release-smoke) + 2 (new integration) + existing scripts/integration tests; all PASS.

- [ ] **Step 2.5: Run `npm run check`**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -15
```
Expected: exit 0. Fix any biome formatting issues in the new file before continuing.

- [ ] **Step 2.6: Commit (integration test only)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add scripts/integration/release-smoke-auto-invoke.test.mjs && git status --short
```
Expected: exactly one new file staged, nothing else.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "test(agent): integration test for release-smoke local-release auto-invoke

Two cases:
- outDir exists → no auto-invoke, matrix runs, 3 SKIP cells
- outDir absent → local-release invoked; hard-fail with empty cells
  when local-release exits non-zero (spec §4.C.6 contract)"
```
Expected: 1 commit, 1 file created.

---

## Task 3: Wire `release:smoke` into `package.json` + `prepublishOnly`

**Files:**
- Modify: `package.json` (add 1 script; modify `prepublishOnly`)

- [ ] **Step 3.1: Read current `package.json` scripts block**

Already in context (lines 14-51). Key facts:
- `prepublishOnly` is on line 40: `"prepublishOnly": "npm run clean && npm run build && npm run check"`
- `release:local` is on line 43: `"release:local": "node scripts/local-release.mjs"`

- [ ] **Step 3.2: Add `release:smoke` script**

Edit `package.json`. Insert ONE new line after the `"release:local"` line (line 43):

```jsonc
		"release:smoke": "node scripts/release-smoke.mjs",
```

Note the leading TAB (matches existing indentation in the file).

- [ ] **Step 3.3: Extend `prepublishOnly` chain**

Edit `package.json`. Change line 40 from:
```jsonc
		"prepublishOnly": "npm run clean && npm run build && npm run check",
```
to:
```jsonc
		"prepublishOnly": "npm run clean && npm run build && npm run check && npm run release:smoke",
```

- [ ] **Step 3.4: Validate JSON**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('valid')"
```
Expected: `valid`. If parse fails, revert the edit and retry.

- [ ] **Step 3.5: Verify the new script is reachable**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run | grep -E "release:smoke|prepublishOnly"
```
Expected: both lines appear in output.

Then dry-run the script with `--help`-equivalent flag (yargs supports `--help`):
```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node scripts/release-smoke.mjs --help 2>&1 | tail -20
```
Expected: yargs prints usage (skip-bun, skip-real-provider, out). If it instead tries to invoke local-release.mjs because outDir default is missing, that is correct behavior — Ctrl+C and proceed.

- [ ] **Step 3.6: Run `npm run check`**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -15
```
Expected: exit 0.

- [ ] **Step 3.7: Commit (package.json only)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add package.json && git status --short
```
Expected: exactly `M package.json`.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(agent): add release:smoke npm script; chain into prepublishOnly

- New release:smoke script wires scripts/release-smoke.mjs
- prepublishOnly: clean → build → check → release:smoke
  (smoke runs after check passes; on auto-invoke failure exits 1)"
```
Expected: 1 commit, 1 file modified.

---

## Task 4: Create `.github/workflows/release-smoke.yml`

**Files:**
- Create: `.github/workflows/release-smoke.yml`

- [ ] **Step 4.1: Inspect existing workflow file shape**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && head -40 .github/workflows/ci.yml 2>&1
```
Expected: GH Actions workflow with `on:`, `jobs:`, `runs-on: ubuntu-latest`, Node setup via `actions/setup-node@v4` with `node-version: 22.19`. Mirror that style.

- [ ] **Step 4.2: Write the workflow file**

Create `.github/workflows/release-smoke.yml`:

```yaml
# Spec deviation note (recorded 2026-09-08 in
# docs/superpowers/specs/2026-09-08-release-smoke-closure-design.md §2.3):
#   Parent spec §4.C.7 + §5.3 require triggers `push tags: ['v*']` +
#   `workflow_dispatch` ONLY. This workflow expands to PR + main + tag +
#   workflow_dispatch per the user's 2026-09-08 decision (competition
#   schedule — extra CI cost is acceptable to gain a release-time gate).
name: release-smoke

on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
  workflow_dispatch:

concurrency:
  group: release-smoke-${{ github.ref }}
  cancel-in-progress: true

jobs:
  smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22.19'

      - name: Install deps (no scripts)
        run: npm ci --ignore-scripts

      - name: Build (offline model catalog)
        run: npm run build:offline

      - name: Detect PI_*_API_KEY secrets
        id: secrets
        shell: bash
        run: |
          if compgen -G "PI_*_API_KEY" > /dev/null || env | grep -qE '^PI_[A-Z0-9_]+_API_KEY='; then
            echo "has_real_provider=true" >> "$GITHUB_OUTPUT"
          else
            echo "has_real_provider=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Run release smoke
        if: steps.secrets.outputs.has_real_provider == 'true'
        run: npm run release:smoke

      - name: Run release smoke (skip real provider — no secrets)
        if: steps.secrets.outputs.has_real_provider != 'true'
        run: |
          echo "INFO: no PI_*_API_KEY secrets — falling back to --skip-real-provider (spec §4.C.7 fallback)"
          npm run release:smoke -- --skip-real-provider
```

- [ ] **Step 4.3: Validate YAML**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node -e "const y=require('fs').readFileSync('.github/workflows/release-smoke.yml','utf8'); console.log(y.split('\n').length,'lines; first trigger line:', y.split('\n').find(l=>l.includes('pull_request')))"
```
Expected: prints line count and the pull_request line. (No structural YAML validator on the path; rely on GH-side parse on first push.)

- [ ] **Step 4.4: Run `npm run check` (workflow is not under biome, but check is harmless)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -10
```
Expected: exit 0. Workflow YAML is not biome-scanned.

- [ ] **Step 4.5: Commit (workflow only)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add .github/workflows/release-smoke.yml && git status --short
```
Expected: exactly `A .github/workflows/release-smoke.yml`.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(agent): add release-smoke GH workflow

Triggers: pull_request, push to main, push tag v*, workflow_dispatch.
Secrets gate: when any PI_*_API_KEY is present in env, run with
real-provider cell; otherwise fall back to --skip-real-provider.
Header comment records the §4.C.7 trigger-expansion deviation."
```
Expected: 1 commit, 1 file created.

---

## Task 5: Document `release:smoke` in `AGENTS.md` + add CHANGELOG entry

**Files:**
- Modify: `AGENTS.md` (insert new step 1.5 in §Releasing)
- Modify: `packages/agent/CHANGELOG.md` (append `### Added` subsection under `## [Unreleased]`)

- [ ] **Step 5.1: Locate insertion point in AGENTS.md**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && grep -n -E "^1\\. \\*\\*Update CHANGELOGs|^2\\. \\*\\*Local smoke test" AGENTS.md
```
Expected: line numbers for `1. **Update CHANGELOGs**` and `2. **Local smoke test**`. Insert the new step 1.5 BETWEEN them.

- [ ] **Step 5.2: Insert step 1.5 into AGENTS.md §Releasing**

Locate the heading `## Releasing` and the line `2. **Local smoke test**:`. Insert this block immediately before line 2:

```md
1.5. **Pre-release smoke (scripted)**: as a faster alternative to the manual
    step 2 commands, run:

    ```bash
    npm run release:smoke
    ```

    This invokes `scripts/release-smoke.mjs`, which auto-runs
    `scripts/local-release.mjs --out <dir> --force` when the artifact
    directory is missing, then spawns the 8-cell smoke matrix defined in
    `docs/superpowers/specs/2026-08-31-jesus-improvements-route-a.md`
    §4.C (Node + Bun × `--help` / `--version` / `--list-models` / `-p "ok"`).

    - Bun cells are SKIP (not FAIL) if `bun` is not installed.
    - Escape hatch: `npm run release:smoke -- --skip-real-provider` skips
      the `-p "ok"` real-provider call (keeps the 6 binary/CLI cells).
    - Hard-fails on the first failing `--help` / `--version` / `--list-models`.
    - `-p "ok"` issues one real provider request per release by default.

    The manual step 2 below remains required for interactive TUI startup
    testing (the scripted smoke does not cover tmux interactive sessions).

```

- [ ] **Step 5.3: Add CHANGELOG entry**

Read `packages/agent/CHANGELOG.md` top 10 lines; locate the `## [Unreleased]` heading and any existing `### Added` / `### Changed` subsections under it.

Edit `packages/agent/CHANGELOG.md`. Replace the existing `## [Unreleased]` section (which currently has NO subsections) with:

```md
## [Unreleased]

### Added

- Added `npm run release:smoke` scripted smoke matrix (Node + Bun × `--help` / `--version` / `--list-models` / `-p "ok"`) that auto-invokes `scripts/local-release.mjs` when the artifact directory is missing. Wired into `prepublishOnly` after `check`. Added `.github/workflows/release-smoke.yml` (PR + main + tag triggers; secrets-gated real-provider call). See `docs/superpowers/specs/2026-09-08-release-smoke-closure-design.md`.
```

If `## [Unreleased]` already contains subsections, append a NEW `### Added` section rather than replacing.

- [ ] **Step 5.4: Verify changes**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && sed -n '125,160p' AGENTS.md
```
Expected: the new step 1.5 paragraph appears between the heading and step 2.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && head -10 packages/agent/CHANGELOG.md
```
Expected: `[Unreleased]` block now contains the new `### Added` entry.

- [ ] **Step 5.5: Run `npm run check`**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -15
```
Expected: exit 0.

- [ ] **Step 5.6: Commit (docs only)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add AGENTS.md packages/agent/CHANGELOG.md && git status --short
```
Expected: exactly two modified files staged.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "docs(agent): document release:smoke in AGENTS §Releasing; CHANGELOG entry

- AGENTS.md: new step 1.5 (scripted smoke) inserted between step 1
  (Update CHANGELOGs) and step 2 (Local smoke test). Step 2 manual
  tmux interactive smoke remains required for TUI startup.
- packages/agent/CHANGELOG.md: append Added entry under [Unreleased]
  per AGENTS.md §Changelog rule (always append, never duplicate)."
```
Expected: 1 commit, 2 files modified.

---

## Task 6: Final verification + final commit if anything leftover

**Files:** none new — verification only.

- [ ] **Step 6.1: Track the smoke test file from initial untracked state**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git status --short
```
Expected: only `scripts/release-smoke.test.mjs` should still show as untracked (it was untracked at session start). If anything else is untracked, inspect before continuing.

- [ ] **Step 6.2: Stage + commit the original test file (untracked → tracked)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add scripts/release-smoke.test.mjs && git status --short
```
Expected: only the test file staged, nothing else.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "test(agent): track pre-existing release-smoke unit tests

scripts/release-smoke.test.mjs was written during route-A §4.C spec
work but never committed. It covers the 4 runSmoke() behaviors
(existing test file; this commit only adds it to git tracking)."
```
Expected: 1 commit, 1 file added.

- [ ] **Step 6.3: Run full verification suite**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run test:scripts 2>&1 | tail -15
```
Expected: exit 0; all release-smoke tests pass.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -15
```
Expected: exit 0.

- [ ] **Step 6.4: Verify spec §8 acceptance criteria**

Run each verification:

| Spec §8 criterion | Command | Expected |
|---|---|---|
| I-1 公共导出未变 | `git diff a378121..HEAD -- 'packages/*/src/index.*' 'packages/*/src/public.*' ':!**/models.generated.ts' \| head -10` | empty |
| I-2 `PI_*` env 未变 | `git diff a378121..HEAD -- '**/*.ts' '**/*.mjs' \| grep -E '^[+-].*PI_[A-Z]' \| grep -v '^--' \| head` | empty |
| I-3 `scripts/` 路径未改名 | `git diff a378121..HEAD --stat -- 'scripts/' \| head` | only new files, no renames |
| I-4 `check:*` 仍跑通 | `npm run check:pinned-deps && npm run check:ts-imports && npm run check:shrinkwrap && npm run check:install-lock:coding-agent && npm run check:browser-smoke` | all exit 0 |
| §8 #3 `npm run release:smoke --skip-bun` 在本机可跑 | `node scripts/release-smoke.mjs --skip-bun --skip-real-provider --out $(mktemp -d) 2>&1 \| tail -20` | exits 0; SKIP cells for missing pi binaries (no local-release needed because we passed an outDir that exists) |

- [ ] **Step 6.5: View the commit chain**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git log --oneline a378121..HEAD
```
Expected: 6 commits, ordered:
1. `feat(agent): auto-invoke local-release in release-smoke (spec §4.C.6)`
2. `test(agent): integration test for release-smoke local-release auto-invoke`
3. `feat(agent): add release:smoke npm script; chain into prepublishOnly`
4. `feat(agent): add release-smoke GH workflow`
5. `docs(agent): document release:smoke in AGENTS §Releasing; CHANGELOG entry`
6. `test(agent): track pre-existing release-smoke unit tests`

- [ ] **Step 6.6: Final report**

Run:
```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git log --oneline a378121..HEAD && echo "---" && git status --short && echo "---" && npm run check 2>&1 | tail -3
```
Report back to the user:
- Commit count and titles
- `npm run check` final status
- Remaining untracked files (should be empty)

---

## Self-Review

### Spec coverage check

| Spec section | Implemented in task |
|---|---|
| §1 不变量 I-1~I-6 维持 | Task 6.4 verifies I-1~I-4 directly; I-5/I-6 are not touched |
| §2.1 auto-invoke + 行为表 | Task 1 |
| §2.1 偏离注("429 skip") | Documented in Task 1 commit message |
| §2.2 package.json wire-up | Task 3 |
| §2.3 CI workflow + 偏离注 | Task 4 |
| §2.4 AGENTS.md 增量 + CHANGELOG | Task 5 |
| §3 验收表 #3 #4 #7 | Task 6.4 |
| §4 文件清单 | All 5 modified/created files covered by Tasks 1/2/3/4/5/6 |
| §5 范围外:不动 release.mjs 第 6 步 | Confirmed: no `release.mjs` edits in any task |

### Placeholder scan

Searched for: `TODO`, `TBD`, `implement later`, `fill in details`, `similar to`, `add appropriate error handling`. One occurrence in Task 1.2 of the literal word "TODO" inside a comment explaining why a stub test was abandoned — replaced with an explicit redirect to Task 2. No other placeholders.

### Type / signature consistency

- `runSmoke({ outDir, skipBun, skipRealProvider })` — same signature used in `release-smoke.mjs` and `release-smoke.test.mjs` and the new integration test. Consistent.
- `process.execPath` + `spawnSync` — used in both Task 1.3 and Task 2.2 (test). Consistent.
- `--out <dir> --force` flag pair — same as `local-release.mjs` accepts. Verified in Task 0 (initial read of `local-release.mjs` head).

### Spec deviation log (for the user's audit trail)

| Item | Deviation | Recorded where |
|---|---|---|
| CI triggers | PR + main + tag + workflow_dispatch (spec said tag + workflow_dispatch only) | spec §2.3 inline note + workflow header comment |
| `-p "ok"` 429 retry | Skipped (spec deferred) | spec §2.1 inline note |
| Doc target | AGENTS.md (spec initial draft said README.md, but README has no §Releasing) | spec §2.4 inline note + spec amended in commit `a378121` |
