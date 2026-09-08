---
type: spec
created: 2026-09-08
updated: 2026-09-08
topic: jesus-release-smoke-closure
route: A · §4.C
parent_spec: 2026-08-31-jesus-improvements-route-a
tags: [project, agent, jesus, route-a, release-smoke]
---

# Jesus Agent · 路线 A §4.C 烟测块闭合设计

## 0. 背景与目标

`C:\Users\Administrator\projects\jesus-agent-harness\` 的路线 A(2026-08-31 spec/plan)三块
中,§2(Provider e2e)与 §3(Git 多 session 安全网)已 commit 上 main。
**§4.C(Pre-release smoke pack)代码已写完**(untracked: `scripts/release-smoke.mjs`、
`scripts/release-smoke.test.mjs`),但**未 wire、未 commit、未上 CI**。

本设计把这块**闭合**:wire 进 `package.json` 的 `prepublishOnly`,补 `.github/workflows/
release-smoke.yml`,把 §4.C.6 spec 要求的 `local-release` 自动调用补进 `runSmoke()`,
commit 全部产物,使 spec §8 验收 #3-#4-#7 全部满足。

## 1. 不变量(继承父 spec §1 + 本次强化)

路线 A 6 条不变量 **全部不动**(I-1 公共导出 / I-2 `PI_*` env / I-3 脚本路径 /
I-4 `check:*` 全跑 / I-5 release 走 npm script / I-6 锁文件需 `PI_ALLOW_LOCKFILE_CHANGE`)。

新增 I-7:`scripts/release-smoke.mjs` 与 `scripts/release-smoke.test.mjs` 视为本 spec
新增的"scripts 类"工件,继承 I-3 路径不变原则 — 改名需走 spec 修订。

## 2. 设计逐节(继承父 spec §4.C,只列增量与契约收敛)

### 2.1 `scripts/release-smoke.mjs` — 补 §4.C.6 自动 local-release

`runSmoke()` 入口处插入产物自举(spec §4.C.6 第一行):

```js
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));

if (!existsSync(outDir)) {
  console.log(`[release-smoke] artifact dir ${outDir} missing — auto-invoking local-release.mjs --out ${outDir} --force`);
  const r = spawnSync(
    process.execPath,
    [join(__dirname, "local-release.mjs"), "--out", outDir, "--force"],
    { stdio: "inherit" },
  );
  if (r.status !== 0) {
    return { exitCode: 1, cells: [] };  // hard fail per §4.C.6
  }
}
```

行为表收敛(覆盖 `runCell` 现有分支 + 新增自举):

| 触发条件 | 行为 | 来源 |
|---|---|---|
| `outDir` 不存在 | 自动调 `local-release.mjs --out <dir> --force` | 本 spec §2.1,父 §4.C.6 |
| `local-release` 退出码非 0 | 硬退出 `exitCode: 1`,cells 空数组 | 父 §4.C.6 |
| `outDir/<runtime>/pi.js` 不存在 | SKIP(`binary missing`) | 已有逻辑 |
| Bun runtime 未安装 + 未 `--skip-bun` | 该 runtime 全部 cells 标 SKIP(`runtime missing`) | 父 §4.C.6 |
| `--help` / `--version` / `--list-models` 任一 FAIL | 硬退出,保留到该 cell 为止 | 父 §4.C.6 |
| `-p "ok"` 5xx | 硬退出(已有逻辑不重试) | 父 §4.C.6 |
| `-p "ok"` 429 | 本 spec 不引入指数回退(plan 文档化过,代价/收益不值) | 本 spec §2.1 偏离注 |

**§4.C.6 偏离注**:父 spec 提到"-p ok 429 一次指数回退",本 spec **不实现**该回退。
`runSmoke` 已有逻辑把任何 `-p` 失败直接转 FAIL;真正的回退行为由上游 provider
adapter / 业务调用者承担,smoke 是粗粒度信号不是 SDK。父 spec §7 已把"具体重试策略"
列为 deferred,本 spec 显式决定 **skip**。

### 2.2 `package.json` — wire-up(spec §4.C.2)

新增一条 script:

```jsonc
"release:smoke": "node scripts/release-smoke.mjs"
```

`prepublishOnly` 改为:

```jsonc
"prepublishOnly": "npm run clean && npm run build && npm run check && npm run release:smoke"
```

注:`--skip-real-provider` 不进 script 字符串;`release.mjs` 第 6 步(spec §4.C.2
未要求)维持原状 `npm run check` + `npm run test`,**不改 release.mjs**。

### 2.3 `.github/workflows/release-smoke.yml` — 新建(spec §4.C.7,本 spec §2.3 偏离)

Trigger:

```yaml
on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
  workflow_dispatch:
```

> **§4.C.7 偏离注**(用户 2026-09-08 决策):父 spec §4.C.7 + §5.3 要求"仅 tag push + workflow_dispatch"。
> 本 spec 扩到 PR + main + tag + workflow_dispatch 三档。
> 偏离原因:用户在参赛节奏下希望"发布前更多一道门",愿意承担 main push CI 额外 2-3 分钟。

Jobs(`smoke`,ubuntu-latest,Node 22.19):

1. checkout
2. `npm ci --ignore-scripts`
3. `npm run build:offline`
4. secrets gate:env 中任一 `PI_*_API_KEY` 存在 → `npm run release:smoke`;
   否则 `npm run release:smoke -- --skip-real-provider` + 在 step log 里 print
   `INFO: no PI_*_API_KEY secrets — falling back to --skip-real-provider`
5. 不需要 Node/Bun 多平台 matrix;Bun 由 `release-smoke.mjs` 自行
   `spawn("bun", ...)` + ENOENT → SKIP 兜底(用户本地缺 bun 不影响 CI)。

**CI 必带 `--skip-real-provider` fallback**:spec §8 验收 #4 要求"带 PI_*_API_KEY 成功",
本 spec 用 secrets 缺失时 fallback 实现"无 secrets 仍能跑通",两条都覆盖。

### 2.4 `AGENTS.md` §Releasing — 增量文档(spec §2.4 修订)

> **修订注**:spec 初稿说"在 README.md §Releasing 加一段"。实际 README.md 没有 §Releasing
> 章节,该章只在 `AGENTS.md` 第 127-165 行。本 spec 把文档增量放到 `AGENTS.md` §Releasing
> 步骤 2 之前(插入位置:第 132 行 `Local smoke test` 段前)。

新增一段(放在 `## Releasing` 步骤 2 之前):

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

## 3. 测试 / 验收对照(spec §8)

| 父 spec 验收点 | 本 spec 兑现方式 | 验证命令 |
|---|---|---|
| §8 #3 `npm run release:smoke --skip-bun` Win/Linux 通 | Windows 本机跑,CI ubuntu-latest 跑 | `npm run release:smoke -- --skip-bun` |
| §8 #4 带 `PI_*_API_KEY` 成功 | CI tag push secrets gate 命中分支 | 看 GH Actions run |
| §8 #7 CI workflow 在 smoke 失败时 block tag push | workflow job fail → GH 拒绝 tag push(默认) | 改一个 mock pi 让 smoke 必败,故意跑一次 |
| I-1 ~ I-6 | grep diff 公共导出 / `PI_*` env / `scripts/` 路径 | `git diff main -- ':!package-lock.json' \| grep -E '^(\\+|-).*(PI_|@jesus/.*public\|from .scripts/)' \| head -20` |
| `npm run test:scripts` 覆盖新 .test.mjs | 已有 `test:scripts` 通配 `scripts/*.test.mjs`,自动 | `npm run test:scripts` |
| `npm run check` 通过 | 跑一遍 | `npm run check` |

## 4. 文件清单(本次 commit 范围)

```
M  package.json                                    # +release:smoke, prepublishOnly 链尾接
A  scripts/release-smoke.mjs                       # untracked → tracked (含 auto-invoke 增量)
A  scripts/release-smoke.test.mjs                  # untracked → tracked (原样)
A  .github/workflows/release-smoke.yml             # NEW (头部加 §4.C.7 偏离 inline note)
M  AGENTS.md                                        # §Releasing 步骤 1.5 新增(替换 spec 初稿的 README)
M  packages/agent/CHANGELOG.md                      # [Unreleased] 下追加 Added 条目
```

单 commit,message 按 `AGENTS.md` 格式(本仓库历史惯例):

```
feat(agent): wire release-smoke into prepublishOnly + CI

- runSmoke() now auto-invokes local-release.mjs when artifact dir missing
  (per spec 2026-08-31-jesus-improvements-route-a §4.C.6)
- package.json: new release:smoke script; prepublishOnly chains it after check
- .github/workflows/release-smoke.yml: PR + main + tag + workflow_dispatch
  triggers; secrets gate selects real-provider vs --skip-real-provider
- AGENTS.md §Releasing: document release:smoke as step 1.5 (scripted
  alternative to manual step 2 for non-interactive cells)
- packages/agent/CHANGELOG.md: append Added entry under [Unreleased]

Spec deviation: §4.C.7 expanded triggers to include PR + main push
(see inline note in release-smoke.yml).
```

## 5. 范围之外(明确不做的)

- 不动 `scripts/release.mjs` 第 6 步(spec §4.C.2 没要求)
- 不动 `scripts/release.mjs` 第 2 步的"assert packages registered with npm"
- 不引入新 npm 依赖(yargs/p-limit/tinyglobby 已 pin)
- 不动 spec 主文档(只在本 spec 内 inline 修订注,**不改 2026-08-31 父 spec**)
- 不实现 `-p "ok"` 429 指数回退(spec §7 已 deferred,本 spec 显式 skip)
- 不做 Node/Bun 多平台 CI matrix;Bun 由 runtime 缺失自动 SKIP 兜底
- 不做 release-smoke 的 JUnit XML 输出(spec §7 已 deferred)
- 不做 `session-registry` 30 天归档(父 spec §9 风险项,不属于本 spec 范围)

## 6. 关联

- 父 spec:`docs/superpowers/specs/2026-08-31-jesus-improvements-route-a.md`
- 父 plan:`docs/superpowers/plans/2026-08-31-jesus-improvements-route-a.md`
- 项目档案:`C:\Users\Administrator\Documents\Obsidian\AI-Memory\50-项目档案\jesus-agent-harness.md`
- 比赛档案:`C:\Users\Administrator\Documents\Obsidian\AI-Memory\50-项目档案\2026-09-03-jesus-contest-strategy.md`