---
type: spec
created: 2026-09-08
updated: 2026-09-08
topic: jesus-setup-llm-onboarding
route: B · new feature
tags: [project, agent, jesus, tui, onboarding, setup-llm]
---

# Jesus Agent · `--setup-llm` Onboarding Wizard

## 0. 背景

Jesus agent 当前的 LLM 配置机制是分散的:`PI_<PROVIDER>_API_KEY` env var、`settings.json` 的 `defaultProvider`/`defaultModel`、手工编辑 settings.json。新用户首次接触不知道用什么 provider、key 怎么设、model 选哪个 — 这正是 Tauric Research 的 TradingAgents CLI 通过引导式 wizard 解决的事。

本 spec 加一个 **`pi --setup-llm` CLI flag**:手动启动 3 步 wizard(Pick provider → Pick model → Enter API key),把选择写到 settings.json。不改默认启动流程(用户必须显式跑 `--setup-llm`,不破坏现有用户习惯)。

## 1. 目标 / 非目标

### 目标

1. 单一命令入口:`pi --setup-llm`
2. 3 步交互:provider → model → API key
3. API key 明文存 `~/.jesus/agent/settings.json` 的新字段 `providerKeys`
4. 完成后用所选 provider+model 启动 agent(直接进 TUI,与 `pi --provider X --model Y` 等价)

### 非目标

- 不改默认启动流程(`pi` 不变;`FirstTimeSetupComponent` / `shouldRunFirstTimeSetup` 不动)
- 不引入加密(MVP 接受明文;后续可迁 OS keyring)
- 不自动检测已设的 `PI_*_API_KEY` env(wizard 是主动 onboarding;env 仍然最高优先)
- 不改 provider registry(`@jesus/ai/providers/all.ts` 不动)
- 不做 agent 内的 `/setup-llm` slash command(只在 CLI flag 层)

## 2. 不变量(路线 A I-1 ~ I-6 + 本次强化)

路线 A 6 条**全部维持**:

- **I-1**(公共导出):`@jesus/coding-agent` 公开导出集合不变;新增 `PasswordInputComponent` 走 `@jesus/tui` 公开导出,需保持向后兼容(默认 export 不破现有 import)
- **I-2**(`PI_*` env):不动 `PI_*` 系列 env 的解析逻辑
- **I-3**(`scripts/` 路径):本次只动 `packages/coding-agent/src/` 和 `packages/tui/src/`
- **I-4**(`check:*` 通过):本次 commit 不新增 biome warning;已存在的 `packages/coding-agent/src/main.ts` pre-existing warning 不在范围
- **I-5**(release 走 npm script):不动
- **I-6**(lockfile):不动 `package-lock.json`(本次无新依赖)

## 3. 设计

### 3.1 命令入口

`packages/coding-agent/src/cli/args.ts`:

```ts
export interface Args {
  // ... existing fields ...
  setupLlm?: boolean;
}
```

在 `parseArgs()` 加 `--setup-llm` 处理:无值,纯 boolean flag。help 文本加一行:

```
--setup-llm           Run interactive LLM provider/model/key setup wizard
```

### 3.2 主流程(`packages/coding-agent/src/main.ts`)

`main(args)` 入口:

```ts
const parsed = parseArgs(args);
if (parsed.setupLlm) {
  await showSetupLlmWizard(settingsManager);
  return; // wizard 自己 exit,不进主循环
}
```

`showSetupLlmWizard` 在 `packages/coding-agent/src/cli/setup-llm.ts`(新文件)。

### 3.3 Wizard 组件(`packages/coding-agent/src/modes/interactive/components/setup-llm.ts`)

新 `SetupLlmComponent extends Container`,3 个 step(`provider` | `model` | `apikey`)+ 顶部 banner。沿用 `FirstTimeSetupComponent` 的"clear + rebuild on every change"模式(theme preview 需要)。

#### 3.3.1 Banner

```ts
const SETUP_LLM_BANNER = [
  "=====================================",
  "          ✝  J E S U S   A G E N T",
  "       LLM Provider Setup Wizard",
  "=====================================",
];
```

`✝` 字符(U+2719)保持十字架语义,纯文本(用户决策)。

#### 3.3.2 Step 1:Provider

- 调 `@jesus/ai` 的 `getBuiltinProviders()`(返回 `BuiltinProvider[]`,39 个)
- 列表按字母排序,前 12 个 + "... + N more (PageDown) ..." 风格不现实(39 个不需要分页,Terminal 80x24 可滚动显示)
- 默认高亮当前 `settings.json.defaultProvider`(若存在)
- 复用 `ExtensionSelectorComponent`(已存在,接受 `string[]`)

> **风险与诚实标注**:ExtensionSelectorComponent 当前无分页逻辑(39 项可显示但首屏高度可能溢出)。MVP 不加分页,接受用户用终端原生 scroll 或滚动;后续 spec 可加分页。

#### 3.3.3 Step 2:Model

- 调 `getBuiltinModels(provider)`,返回 `Model[]`
- 提取 `id` 字段到 `string[]`
- 默认高亮当前 `defaultModel`(若属于该 provider)
- 同样复用 `ExtensionSelectorComponent`

#### 3.3.4 Step 3:API key(新增 `PasswordInputComponent`)

- 新组件 `PasswordInputComponent extends Container`(放 `packages/tui/src/components/password-input.ts`)
- 输入框模式:每个字符渲染成 `*` mask,内部 buffer 保留真实字符串
- 支持 Backspace + Ctrl+U(清空)+ Enter(提交)+ Esc(取消)
- 无 native dep,纯字符处理

### 3.4 Settings 写入(`packages/coding-agent/src/core/settings-manager.ts`)

`Settings` interface 加 1 字段:

```ts
export interface Settings {
  // ... existing fields ...
  providerKeys?: Record<string, string>; // provider -> API key (plaintext, MVP)
}
```

`SettingsManager` 加 1 方法:

```ts
setProviderKey(provider: string, apiKey: string): void {
  this.globalSettings.providerKeys = {
    ...(this.globalSettings.providerKeys ?? {}),
    [provider]: apiKey,
  };
  this.markModified("providerKeys");
  this.save();
}
```

### 3.5 读取 API key(主流程集成)

wizard 完成后,`--provider X --model Y` 仍按现有路径走;`providerKeys[X]` 仅在用户没设 `PI_X_API_KEY` env 时作为 fallback。

**MVP 行为**:wizard **不**改现有 env var 解析路径;用户后续可在 wizard 外用 env 覆盖(settings.json key 仅在 env 缺失时被读)。

为最小变更,wizard 后**只在 settings.json 写 providerKeys**,**不动 env 解析**。Provider 适配层是否读 `providerKeys` 是后续 spec 范围(本 spec 不引入 provider adapter 改动)。

> **风险**:MVP 写完后,settings.json 里的 `providerKeys[anthropic]` 不会自动被 anthropic provider 读 — 用户仍需 `export PI_ANTHROPIC_API_KEY=...`。诚实标注。
>
> **缓解**:wizard 完成后在终端打印提示:
> ```
> Note: API key stored in settings.json. The provider still reads PI_<PROVIDER>_API_KEY env var by default.
> To use the stored key, either export it now or wait for the providerKeys fallback (added in a follow-up spec).
> ```

## 4. 测试 / 验收对照

| 验收点 | 验证方式 |
|---|---|
| `pi --setup-llm` 启动 wizard | 本机 `node packages/coding-agent/dist/cli.js --setup-llm` |
| 选 Provider → Model → Key → settings.json 写入 | 手测 + 读 settings.json 验证 |
| `PasswordInputComponent` mask 字符 | `node --test` 加 unit(字符处理逻辑) |
| `SettingsManager.setProviderKey` 持久化 | `node --test` 加 unit |
| 不破坏现有 `pi --help` 输出 | 跑 `pi --help \| grep -- "--setup-llm"` |
| 不破坏 FirstTimeSetup | 跑 `PI_EXPERIMENTAL=1 pi`,确认 theme+analytics wizard 仍出现 |
| `npm run check` 不引入新 warning | 跑(已知 2 个 pre-existing 不修) |
| `npm run test:scripts` 不退化 | 跑 |

## 5. 文件清单(本次 commit 范围)

```
M  packages/coding-agent/src/cli/args.ts                     # +setupLlm? field + --setup-llm flag
M  packages/coding-agent/src/main.ts                         # +setupLlm 分支路由
A  packages/coding-agent/src/cli/setup-llm.ts                # NEW wizard orchestrator
A  packages/coding-agent/src/modes/interactive/components/setup-llm.ts  # NEW wizard component
M  packages/coding-agent/src/core/settings-manager.ts        # +providerKeys field + setProviderKey()
M  packages/tui/src/index.ts                                 # export PasswordInputComponent
A  packages/tui/src/components/password-input.ts             # NEW
A  packages/tui/src/components/password-input.test.ts        # NEW unit test
M  packages/coding-agent/src/core/settings-manager.test.ts   # +setProviderKey test (if test file exists)
```

单 commit,message:

```
feat(tui,agent): add --setup-llm wizard with provider/model/key onboarding

- New pi --setup-llm CLI flag → 3-step wizard (provider → model → API key)
- New PasswordInputComponent in @jesus/tui (mask input)
- SettingsManager.setProviderKey() writes plaintext to settings.json
- providerKeys Record<string,string> field in Settings (MVP; doc note
  about env var precedence + providerKeys fallback as future spec)
- Banner: ✝  J E S U S   A G E N T  (plain text per 2026-09-08 user choice)
```

## 6. 范围之外(明确不做的)

- 不动 `FirstTimeSetupComponent` / `shouldRunFirstTimeSetup`
- 不改默认启动流程
- 不引入 API key 加密(MVP)
- 不改 `@jesus/ai` provider adapter(后续 spec 加 providerKeys fallback)
- 不加分页(39 项接受 terminal scroll)
- 不做 `pi-config` 类命令(单命令足够)
- 不做 agent 内 slash command `/setup-llm`
- 不修改 `packages/ai/src/models.generated.ts`(AGENTS.md §Code Quality #27)

## 7. 关联

- 父项目档案:`C:\Users\Administrator\Documents\Obsidian\AI-Memory\50-项目档案\jesus-agent-harness.md`
- 路线 A 闭合:本次 spec 2026-09-08-release-smoke-closure-design(独立 spec,无依赖)
- 比赛档案:`C:\Users\Administrator\Documents\Obsidian\AI-Memory\50-项目档案\2026-09-03-jesus-contest-strategy.md` Day 2-3 任务(本 spec 与之正交,可并行)