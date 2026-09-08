---
type: spec
created: 2026-09-08
updated: 2026-09-08
topic: secret-store-os-keyring
route: setup-llm follow-up #2
parent_spec: 2026-09-08-jesus-setup-llm-onboarding-design §3.5
tags: [project, agent, jesus, security, keytar, setup-llm-followup]
---

# OS Keyring SecretStore — Encrypting API Keys at Rest

## 0. 背景

`pi --setup-llm` 把 provider API key 写到 `settings.json` 的 `providerKeys[provider]` 字段——**明文**。上机(本地 dev box)风险可控,但其他人拿到备份、共享机器、或迁移到云时,API key 直接暴露。

setup-llm spec 标注了两个 follow-up:
1. providerKeys 接入 adapter — **2026-09-08 已闭环**
2. 加密 at rest — **本 spec**

本次让 API key 走 OS 原生 keyring(Windows DPAPI / macOS Keychain / Linux libsecret)。`keytar` 7.9.0 跨平台 binding,npm 仍维护(原仓 atom/node-keytar 已 archived,npm 2025-07-30 仍 patch)。

## 1. 目标 / 非目标

### 目标

1. `packages/coding-agent/src/core/secret-store.ts` 提供 `SecretStore` 抽象
2. `KeytarSecretStore` 实现(OS keyring 主路径)+ `PlaintextSecretStore` fallback(平台不支持时)
3. `SettingsManager.setProviderKey/getProviderKey` 改走 SecretStore
4. `settings.json` 的 `providerKeys` 字段**移除**(key 不再写在 settings.json)
5. `package.json` devDependencies 加 `"keytar": "7.9.0"`
6. 静默 fallback:keytar 加载失败 → 切到 PlaintextSecretStore + stderr warning
7. vitest 单测覆盖 fallback / keytar / plaintext 三路径

### 非目标

- 不动 `@jesus/ai`(单向依赖:coding-agent → ai)
- 不动 `withStoredKeys`(读 `getProviderKey`,自动获益)
- 不动 setup-llm wizard(自动获益)
- 不做 key rotation / expiry
- 不引入其他 native lib(@napi-rs/keyring 等)
- 不动 FirstTimeSetupComponent

## 2. 不变量(路线 A)

- **I-6**(lockfile):新增 `keytar` devDep → `npm install --ignore-scripts` 会更新 lockfile。用户已批准 devDependencies
- **I-1**(公共导出):新增 `SecretStore` 走 `packages/coding-agent/src/` 内部,不增加 `@jesus/coding-agent` 公开导出
- **I-3**(`scripts/` 路径):不动
- **I-2**(`PI_*` env):`PI_*_API_KEY` 仍最高优先级(spec §3.3 优先级序列不变)
- **I-4**(`check:*`):仍跑通;pre-existing warnings 不修

## 3. 设计

### 3.1 SecretStore 接口

```ts
export interface SecretStore {
  /** Persist a secret under a (provider, account) key. */
  set(provider: string, account: string, secret: string): Promise<void>;
  /** Retrieve a secret. Returns undefined if not found. */
  get(provider: string, account: string): Promise<string | undefined>;
  /** Remove a secret. */
  remove(provider: string, account: string): Promise<void>;
}
```

account 命名约定:`SettingsManager.setProviderKey(provider, key)` → `secretStore.set(provider, "providerKey", key)`。

### 3.2 KeytarSecretStore

```ts
import type { SecretStore } from "./secret-store.ts";

let keytarModule: typeof import("keytar") | null = null;
let loadError: Error | null = null;

async function tryLoadKeytar(): Promise<typeof import("keytar") | null> {
  if (keytarModule) return keytarModule;
  if (loadError) return null;
  try {
    keytarModule = await import("keytar");
    return keytarModule;
  } catch (err) {
    loadError = err as Error;
    console.warn(
      "[secret-store] keytar unavailable; falling back to plaintext. " +
        "API keys will be stored unencrypted on disk. " +
        `(${loadError.message})`,
    );
    return null;
  }
}

export function createSecretStore(): SecretStore {
  const fallback = new Map<string, string>();
  let keytar: typeof import("keytar") | null = null;
  let initPromise: Promise<void> | null = null;

  const ensureKeytar = async (): Promise<typeof import("keytar") | null> => {
    if (keytar) return keytar;
    if (!initPromise) initPromise = tryLoadKeytar().then((m) => { keytar = m; });
    await initPromise;
    return keytar;
  };

  return {
    async set(provider, account, secret) {
      const k = await ensureKeytar();
      if (k) {
        await k.setPassword(provider, account, secret);
      } else {
        fallback.set(`${provider}::${account}`, secret);
      }
    },
    async get(provider, account) {
      const k = await ensureKeytar();
      if (k) {
        const v = await k.getPassword(provider, account);
        if (v !== null) return v;
      }
      return fallback.get(`${provider}::${account}`);
    },
    async remove(provider, account) {
      const k = await ensureKeytar();
      if (k) await k.deletePassword(provider, account);
      fallback.delete(`${provider}::${account}`);
    },
  };
}
```

**Fallback semantics**(用户 2026-09-08 决定):
- keytar load 失败 → 切 plaintext in-memory Map + stderr warning
- 用户重启进程 → plaintext 缓存丢失 → `getProviderKey` 返回 undefined → `withStoredKeys` 回退到 env var
- 这是已知 trade-off:不能跨重启 keytar 不可用时,需重新跑 setup-llm

### 3.3 PlaintextSecretStore (test-only)

`packages/coding-agent/src/core/plaintext-secret-store.ts`:

```ts
import type { SecretStore } from "./secret-store.ts";

/**
 * Pure in-memory SecretStore for tests. No persistence.
 */
export class PlaintextSecretStore implements SecretStore {
  private store = new Map<string, string>();
  async set(p: string, a: string, s: string): Promise<void> {
    this.store.set(`${p}::${a}`, s);
  }
  async get(p: string, a: string): Promise<string | undefined> {
    return this.store.get(`${p}::${a}`);
  }
  async remove(p: string, a: string): Promise<void> {
    this.store.delete(`${p}::${a}`);
  }
}
```

### 3.4 SettingsManager 改动

`packages/coding-agent/src/core/settings-manager.ts`:

**3.4.1 构造**:接受 `secretStore?: SecretStore`(默认 lazy create 一个 KeytarSecretStore)

```ts
import { type SecretStore, createSecretStore } from "./secret-store.ts";

export interface SettingsManagerCreateOptions {
  // ... existing fields ...
  secretStore?: SecretStore;
}

private readonly secretStore: SecretStore;

static create(
  cwd: string,
  agentDir: string = getAgentDir(),
  options: SettingsManagerCreateOptions = {},
): SettingsManager {
  // ... existing init ...
  const sm = SettingsManager.fromStorageWithPaths(storage, options, paths);
  (sm as { secretStore: SecretStore }).secretStore = options.secretStore ?? createSecretStore();
  return sm;
}
```

**3.4.2 字段**:从 `Settings` interface 移除 `providerKeys?: Record<string, string>`

**3.4.3 方法改 async**:

```ts
async setProviderKey(provider: string, apiKey: string): Promise<void> {
  await this.secretStore.set(provider, "providerKey", apiKey);
}

async getProviderKey(provider: string): Promise<string | undefined> {
  return this.secretStore.get(provider, "providerKey");
}
```

**3.4.4 破坏性变更**:`getProviderKey` 从同步变 async。`withStoredKeys` 包装函数当前同步调用 — 必须改为 async resolve:

```ts
resolve: async (args) => {
  const result = await originalResolve(args);
  if (result?.auth && "apiKey" in result.auth && result.auth.apiKey) return result;
  const stored = await settingsManager.getProviderKey(provider.id);  // ← 现在 await
  // ...
}
```

### 3.5 package.json 改动

`package.json` devDependencies 加:

```jsonc
"keytar": "7.9.0"
```

精确 pin。`npm install --ignore-scripts --package-lock-only` 后 lockfile 更新,需要 `PI_ALLOW_LOCKFILE_CHANGE=1`(AGENTS.md §Git #49)或用户先批准。

## 4. 测试

`packages/coding-agent/test/secret-store.test.ts`(vitest):

1. **PlaintextSecretStore basic CRUD**:set→get→remove 循环
2. **KeytarSecretStore mock + keytar load failure → fallback**:mock `import("keytar")` throws → ensure stderr warning + plaintext fallback works
3. **KeytarSecretStore happy path**:mock `import("keytar")` returns module → set→get→remove 走 keytar mock(不 fallback)
4. **KeytarSecretStore fallback when keytar returns null**:mock keytar.getPassword returns null → fallback map 命中
5. **SettingsManager.setProviderKey delegates to SecretStore**(async)

`packages/coding-agent/test/with-stored-keys-provider.test.ts` 也需更新:把 `getProviderKey` mock 改为 async 返回 Promise。

## 5. 文件清单

```
A  packages/coding-agent/src/core/secret-store.ts
A  packages/coding-agent/src/core/plaintext-secret-store.ts
A  packages/coding-agent/test/secret-store.test.ts
M  packages/coding-agent/src/core/settings-manager.ts       # async getProviderKey/setProviderKey + 移除 providerKeys 字段
M  packages/coding-agent/src/core/with-stored-keys-provider.ts  # resolve 改 await
M  packages/coding-agent/test/with-stored-keys-provider.test.ts  # mock 改 async
M  packages/coding-agent/src/core/model-runtime.ts         # if SettingsManager.create 调用点需要适配 async getProviderKey
M  package.json                                            # devDependencies +keytar 7.9.0
M  package-lock.json                                       # npm install --ignore-scripts 后更新
```

单 commit:

```
feat(agent): encrypt API keys via OS keyring (keytar)

- New SecretStore interface + KeytarSecretStore (primary) +
  PlaintextSecretStore (in-memory fallback for tests + keytar
  load failure cases)
- SettingsManager.setProviderKey/getProviderKey async now;
  reads/writes go through SecretStore (OS keyring), not
  settings.json
- settings.json `providerKeys` field REMOVED — keys are stored
  in OS keyring only (with in-memory fallback when keytar
  unavailable)
- keytar 7.9.0 devDependency (pinned exact). Risk noted:
  upstream atom/node-keytar is archived; npm still publishes
  patches (last 2025-07-30). Fallback to plaintext in-memory
  kicks in if keytar.load fails; warning logged to stderr.
- withStoredKeys provider wrapper now awaits getProviderKey;
  resolves chain is async-correct
```

## 6. 范围之外

- 不做 key rotation / expiry
- 不引入其他 native lib
- 不动 setup-llm wizard UX
- 不改 `PI_*_API_KEY` env var 优先级
- 不修 baseline vitest 6 fail(独立 spec)
- 不修 main.ts pre-existing warnings

## 7. 风险

| 风险 | 缓解 |
|---|---|
| keytar 原仓 archived | 用户 2026-09-08 接受;`createSecretStore()` 失败回 plaintext,不影响启动 |
| native binary 编译失败(罕见 Linux 缺 libsecret) | fallback 到 in-memory + warning |
| fallback in-memory 不跨重启 | 已知 trade-off;warning 文案明示 |
| `getProviderKey` 改 async → withStoredKeys 改 await → ModelRuntime.create 链潜在延迟 | resolve 已 async,无新延迟 |
| providerKeys 字段移除 → 旧 settings.json 字段残留 | 不破坏(只是忽略);Migration 不是必须 |

## 8. 关联

- 父 spec:`2026-09-08-jesus-setup-llm-onboarding-design.md` §3.5
- 上游 follow-up:`2026-09-08-providerkeys-fallback-wiring.md`(已闭环,本次兼容)
- 依赖:`keytar@7.9.0` npm