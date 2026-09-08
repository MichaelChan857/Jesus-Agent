---
type: spec
created: 2026-09-08
updated: 2026-09-08
topic: providerkeys-fallback-wiring
route: setup-llm follow-up
parent_spec: 2026-09-08-jesus-setup-llm-onboarding-design §3.5
tags: [project, agent, jesus, setup-llm-followup, providerKeys]
---

# ProviderKeys Fallback — Coding-Agent Wiring

## 0. 背景

`docs/superpowers/specs/2026-09-08-jesus-setup-llm-onboarding-design.md` §3.5 诚实标注的 follow-up:`pi --setup-llm` 把 provider API key 写到 `~/.jesus/agent/settings.json` 的 `providerKeys[provider]`,但 `@jesus/ai` 的 provider adapter **不读** settings.json —— 只读 `process.env[<env>]`。结果:wizard 看似设了 key,实际 API 调用仍要求 user 设 `ANTHROPIC_API_KEY` 等 env。本 spec 把 settings.json 真正接入 adapter chain。

## 1. 目标 / 非目标

**做**:
1. 新增 `packages/coding-agent/src/core/with-stored-keys-provider.ts`,包装 `provider.auth.apiKey.resolve`,注入 `providerKeys[providerId]` 作为 API key 来源
2. 在 `packages/coding-agent/src/core/model-runtime.ts` 的 provider 构造链中(`builtinProviders()` 后)应用 `withStoredKeys`
3. 新增单测覆盖 3 个分支(credential wins / providerKeys wins / env fallback)

**不做**:
- 不动 `@jesus/ai` 包接口(`getProviderEnvValue` 等保持不变)
- 不引入 settings.json 直接读路径到 `@jesus/ai`
- 不做加密(providerKeys 是明文 MVP)
- 不改 `FirstTimeSetupComponent` 行为
- 不写新 `setup-llm` 步骤

## 2. 不变量

- 路线 A I-1~I-6 全部维持
- `@jesus/ai` 公共导出 / 接口 不变 — 本次只在 coding-agent 加 wrapper
- `PI_*` env 契约不动 — 但 providerKeys 现在**优先于** provider-specific env(`ANTHROPIC_API_KEY` 等),违背常规 CLI 惯例(详见 §3 偏离注)

## 3. 设计

### 3.1 Provider 包装函数

`packages/coding-agent/src/core/with-stored-keys-provider.ts`:

```ts
import type { Provider } from "@jesus/ai";
import type { SettingsManager } from "./settings-manager.ts";

/**
 * Wrap a provider so its apiKey.resolve() consults
 * settings.json providerKeys[providerId] as a source for the API key.
 *
 * Resolution priority (highest → lowest):
 *   1. credential.key (already-stored credential from the auth flow)
 *   2. providerKeys[providerId] (this file's contribution)
 *   3. provider's own env-var lookup (PI_ANTHROPIC_API_KEY etc., unchanged)
 */
export function withStoredKeys(
  provider: Provider,
  settingsManager: SettingsManager,
): Provider {
  const originalResolve = provider.auth?.apiKey?.resolve;
  if (!originalResolve) {
    return provider;  // provider has no apiKey auth path; pass through
  }
  return {
    ...provider,
    auth: {
      ...provider.auth,
      apiKey: {
        ...provider.auth.apiKey,
        resolve: async (args) => {
          const result = await originalResolve(args);
          if (result?.auth && "apiKey" in result.auth && result.auth.apiKey) {
            // credential wins
            return result;
          }
          const stored = settingsManager.getProviderKey(provider.id);
          if (stored) {
            return {
              auth: { apiKey: stored },
              source: `providerKeys[${provider.id}]`,
            };
          }
          return result;  // env fallback (provider's own loop)
        },
      },
    },
  };
}
```

### 3.2 Model runtime 集成

`packages/coding-agent/src/core/model-runtime.ts` 在现有 `withRemoteCatalog` 后再 wrap:

```ts
.map((provider) => provider.id === "radius" ? provider : withStoredKeys(withRemoteCatalog(...), settingsManager))
```

(需要在 model-runtime.ts 找到 SettingsManager 实例;若 model-runtime 接受 settingsManager 参数,则直接传;若不接受,需要在 model-runtime 构造处注入,改面稍大但仍属一处改动。)

### 3.3 偏离注(providerKeys > env,反直觉)

**用户 2026-09-08 显式确认**:本次优先级是 `credential > providerKeys > env`,即 `settings.json` 里的 key **覆盖** process.env 同名 env。

**理由**(用户):"setup-llm 是显式 onboarding,既然用户主动跑了,那是 source of truth;env 通常是无心遗留"。

**风险**:
- 违背 UNIX `env > config file` 惯例
- 用户 export `ANTHROPIC_API_KEY=other-key` 后,wizard 设的 key 仍生效,可能不符合用户预期
- 后续要"改回 env 优先"是简单 spec 修订(wrapper 一行)

**缓解**:
- commit message 显著标注此优先级
- 后续 spec 可加 `pi config provider-keys reset` 工具,让用户显式清掉 wizard 设的 key

### 3.4 测试

`packages/coding-agent/test/with-stored-keys-provider.test.ts`(vitest):

1. `credential wins`:mock resolve 返回 `{ auth: { apiKey: 'cred' } }`,验证 wrapper 不调 settingsManager.getProviderKey
2. `providerKeys wins when no credential`:mock resolve 返回 undefined,settingsManager 返回 `'stored'`,wrapper 返 `{ source: 'providerKeys[xxx]' }`
3. `env fallback when no stored key`:mock resolve 返回 `{ source: 'ANTHROPIC_API_KEY' }`,settingsManager 返回 undefined,wrapper 透传原结果

## 4. 文件清单

```
A  packages/coding-agent/src/core/with-stored-keys-provider.ts
A  packages/coding-agent/test/with-stored-keys-provider.test.ts
M  packages/coding-agent/src/core/model-runtime.ts        # +withStoredKeys wrap
```

单 commit:
```
feat(agent): wire providerKeys fallback into provider resolve chain

- New withStoredKeys() wrapper consults settingsManager.getProviderKey()
  when provider.auth.apiKey.resolve() finds no credential
- Priority (per 2026-09-08 user direction): credential > providerKeys > env
  WARNING: providerKeys now overrides process.env — unusual; documented here
  for reviewer awareness
- 3 unit tests cover credential-wins / providerKeys-wins / env-fallback
```

## 5. 范围之外

- 不改 `@jesus/ai` 包接口(单向依赖:coding-agent → ai)
- 不做加密(MVP)
- 不加 `pi config` reset 命令
- 不动 setup-llm wizard
- 不动 FirstTimeSetupComponent

## 6. 关联

- 父 spec:`docs/superpowers/specs/2026-09-08-jesus-setup-llm-onboarding-design.md` §3.5
- SettingsManager.setProviderKey:`feat(agent): SettingsManager.setProviderKey + providerKeys field`(2026-09-08 commit `e076d95`)