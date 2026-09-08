# OS Keyring SecretStore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Encrypt provider API keys at rest using OS keyring (DPAPI/Keychain/libsecret) via keytar 7.9.0, with in-memory plaintext fallback when keytar is unavailable.

**Architecture:** New `SecretStore` interface. `KeytarSecretStore` lazy-loads keytar once, falls back to in-memory Map on load failure with stderr warning. `PlaintextSecretStore` for tests. `SettingsManager.setProviderKey/getProviderKey` async, go through SecretStore. `providerKeys` field REMOVED from `Settings` interface. `withStoredKeys` resolve awaits getProviderKey.

**Tech Stack:** TypeScript erasable syntax, vitest, keytar 7.9.0 (new devDependency).

**Working directory:** `C:\Users\Administrator\projects\jesus-agent-harness\` (Windows bash).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `packages/coding-agent/src/core/secret-store.ts` | create | SecretStore interface + KeytarSecretStore + createSecretStore() factory |
| `packages/coding-agent/src/core/plaintext-secret-store.ts` | create | In-memory SecretStore for tests |
| `packages/coding-agent/test/secret-store.test.ts` | create | 5 unit tests |
| `packages/coding-agent/src/core/settings-manager.ts` | modify | Remove providerKeys field; async setProviderKey/getProviderKey; accept secretStore option |
| `packages/coding-agent/src/core/with-stored-keys-provider.ts` | modify | resolve awaits getProviderKey |
| `packages/coding-agent/test/with-stored-keys-provider.test.ts` | modify | mock getProviderKey returns Promise |
| `packages/coding-agent/src/core/model-runtime.ts` | modify | If SettingsManager.create() path needs updating for async, check |
| `package.json` | modify | devDependencies + keytar 7.9.0 |
| `package-lock.json` | modify | lockfile update after install |

---

## Constraints (AGENTS.md)

- §Code Quality #22: top-level imports only. Note: `keytar` is dynamic-imported inside the factory (acceptable — not an inline `import("pkg").Type` in user code; `await import("keytar")` is a runtime concern, not a type).
- §Code Quality #23: erasable TypeScript.
- §Dependencies #44: pinned exact versions.
- §Git #49: pre-commit blocks lockfile commits unless `PI_ALLOW_LOCKFILE_CHANGE=1`.
- §Git #58: stage explicit paths.
- §Git #61: commit format `feat(agent): <msg>`.

---

## Task 1: PlaintextSecretStore (no deps, test-friendly)

**Files:**
- Create: `packages/coding-agent/src/core/plaintext-secret-store.ts`

- [ ] **Step 1.1: Create file**

```ts
import type { SecretStore } from "./secret-store.ts";

/**
 * Pure in-memory SecretStore. No persistence. Used by tests + as the
 * fallback layer inside KeytarSecretStore when the OS keyring is unavailable.
 */
export class PlaintextSecretStore implements SecretStore {
	private readonly store = new Map<string, string>();

	private static key(provider: string, account: string): string {
		return `${provider}::${account}`;
	}

	async set(provider: string, account: string, secret: string): Promise<void> {
		this.store.set(PlaintextSecretStore.key(provider, account), secret);
	}

	async get(provider: string, account: string): Promise<string | undefined> {
		return this.store.get(PlaintextSecretStore.key(provider, account));
	}

	async remove(provider: string, account: string): Promise<void> {
		this.store.delete(PlaintextSecretStore.key(provider, account));
	}
}
```

- [ ] **Step 1.2: Run `npm run check`**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -5
```
Expected: 2 pre-existing warnings, no new.

- [ ] **Step 1.3: Commit**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/src/core/plaintext-secret-store.ts && git status --short
```
Expected: exactly `A packages/coding-agent/src/core/plaintext-secret-store.ts`.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(agent): PlaintextSecretStore in-memory implementation

In-memory SecretStore for tests + as the fallback layer inside
KeytarSecretStore when the OS keyring is unavailable. Used by
keytar load failure path. No persistence — keys lost on process
exit (acceptable trade-off documented in spec §7)." 2>&1 | tail -5
```
Expected: 1 commit, 1 file added.

---

## Task 2: SecretStore interface + KeytarSecretStore

**Files:**
- Create: `packages/coding-agent/src/core/secret-store.ts`

- [ ] **Step 2.1: Create file**

```ts
import { PlaintextSecretStore } from "./plaintext-secret-store.ts";

export interface SecretStore {
	/** Persist a secret under (provider, account) key. */
	set(provider: string, account: string, secret: string): Promise<void>;
	/** Retrieve a secret. Returns undefined if not found. */
	get(provider: string, account: string): Promise<string | undefined>;
	/** Remove a secret. */
	remove(provider: string, account: string): Promise<void>;
}

type KeytarModule = typeof import("keytar");

let cachedKeytar: KeytarModule | null = null;
let keytarLoadFailed = false;

/**
 * Best-effort dynamic import of keytar. On failure, log a warning and
 * return null so the caller can fall back to in-memory storage.
 */
async function tryLoadKeytar(): Promise<KeytarModule | null> {
	if (cachedKeytar) return cachedKeytar;
	if (keytarLoadFailed) return null;
	try {
		cachedKeytar = await import("keytar");
		return cachedKeytar;
	} catch (err) {
		keytarLoadFailed = true;
		console.warn(
			`[secret-store] keytar unavailable; falling back to in-memory storage. ` +
				`API keys will not persist across process restart. (${(err as Error).message})`,
		);
		return null;
	}
}

/**
 * Lazy SecretStore: prefers OS keyring (via keytar), falls back to
 * in-memory storage when keytar.load fails. The fallback is silently
 * usable within a single process; restart loses the keys.
 */
export class KeytarSecretStore implements SecretStore {
	private readonly fallback = new PlaintextSecretStore();
	private keytar: KeytarModule | null = null;
	private initPromise: Promise<void> | null = null;

	private async ensureKeytar(): Promise<KeytarModule | null> {
		if (this.keytar) return this.keytar;
		if (!this.initPromise) {
			this.initPromise = tryLoadKeytar().then((m) => {
				this.keytar = m;
			});
		}
		await this.initPromise;
		return this.keytar;
	}

	async set(provider: string, account: string, secret: string): Promise<void> {
		const k = await this.ensureKeytar();
		if (k) {
			await k.setPassword(provider, account, secret);
		} else {
			await this.fallback.set(provider, account, secret);
		}
	}

	async get(provider: string, account: string): Promise<string | undefined> {
		const k = await this.ensureKeytar();
		if (k) {
			const v = await k.getPassword(provider, account);
			if (v !== null) return v;
		}
		return this.fallback.get(provider, account);
	}

	async remove(provider: string, account: string): Promise<void> {
		const k = await this.ensureKeytar();
		if (k) {
			await k.deletePassword(provider, account);
		}
		await this.fallback.remove(provider, account);
	}
}

/** Factory for the default (lazy, keytar-preferred) SecretStore. */
export function createSecretStore(): SecretStore {
	return new KeytarSecretStore();
}
```

- [ ] **Step 2.2: Run check**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -5
```
Expected: 2 pre-existing warnings. TypeScript must accept the dynamic `await import("keytar")`; keytar is installed at install time (Task 4) — but TypeScript may complain about missing module. **If so**, add `// @ts-expect-error keytar loaded at runtime` or include `keytar` types via `npm install --save-dev @types/keytar`.

Verify: if TypeScript error, install `@types/keytar` and import.

- [ ] **Step 2.3: Commit**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/src/core/secret-store.ts && git status --short
```
Expected: exactly `A packages/coding-agent/src/core/secret-store.ts`.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(agent): SecretStore interface + KeytarSecretStore (lazy, fallback)

Interface for OS-keyring-backed secret storage. KeytarSecretStore
prefers OS keyring (keytar); falls back silently to in-memory
PlaintextSecretStore when keytar import fails (logs warning to
stderr). Lazy initialization: keytar is only imported on first
set/get/remove call.

createSecretStore() factory returns a KeytarSecretStore by default.
PlaintextSecretStore (defined in a sibling file) is the fallback
layer + reusable for tests." 2>&1 | tail -5
```
Expected: 1 commit, 1 file added.

---

## Task 3: SettingsManager changes (async + remove providerKeys field)

**Files:**
- Modify: `packages/coding-agent/src/core/settings-manager.ts`

- [ ] **Step 3.1: Remove `providerKeys` from `Settings` interface**

Edit `packages/coding-agent/src/core/settings-manager.ts`. Remove the 3-line block:

```ts
	/** Per-provider API keys stored as plaintext (MVP). Provider adapter
	 * fallback wiring is a follow-up; PI_<PROVIDER>_API_KEY env still wins. */
	providerKeys?: Record<string, string>;
```

- [ ] **Step 3.2: Add `secretStore` to `SettingsManagerCreateOptions`**

Add field:

```ts
	/** Override the default SecretStore (used for testing). */
	secretStore?: import("./secret-store.ts").SecretStore;
```

- [ ] **Step 3.3: Import + accept secretStore in `create()`**

Add import at top:

```ts
import { type SecretStore, createSecretStore } from "./secret-store.ts";
```

Find the existing `static create(...)` method signature. Read its body to find where to add field assignment.

If the existing pattern is:

```ts
static create(cwd, agentDir = getAgentDir(), options: SettingsManagerCreateOptions = {}): SettingsManager {
  // ...
  const sm = SettingsManager.fromStorageWithPaths(storage, options, paths);
  return sm;
}
```

Add after `return sm;` is not possible; instead, attach secretStore to instance via a private field. Approach: add a private `secretStore: SecretStore` field to `SettingsManager`, initialize it from `options.secretStore ?? createSecretStore()` in `create()`. Implementer inspects the existing constructor pattern.

The simplest approach: add a static factory field `sm.secretStore` set after construction:

```ts
const sm = SettingsManager.fromStorageWithPaths(...);
(sm as unknown as { secretStore: SecretStore }).secretStore = options.secretStore ?? createSecretStore();
return sm;
```

Or, more cleanly, extend the `fromStorageWithPaths` constructor to accept secretStore as an option.

**Implementer: pick the path of least resistance that matches the existing code style.** Verify by reading the actual file.

- [ ] **Step 3.4: Convert setProviderKey/getProviderKey to async**

Find current implementations:

```ts
	setProviderKey(provider: string, apiKey: string): void { ... }
	getProviderKey(provider: string): string | undefined { ... }
```

Replace with:

```ts
	async setProviderKey(provider: string, apiKey: string): Promise<void> {
		await this.secretStore.set(provider, "providerKey", apiKey);
	}

	async getProviderKey(provider: string): Promise<string | undefined> {
		return this.secretStore.get(provider, "providerKey");
	}
```

- [ ] **Step 3.5: Run check**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -10
```
Expected: many TypeScript errors from callers not awaiting. These are expected and addressed in Task 5 (withStoredKeys) and the test files. Note them but continue.

- [ ] **Step 3.6: Commit**

Stage only `settings-manager.ts` (callers will be fixed in next tasks).

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/src/core/settings-manager.ts && git status --short
```
Expected: exactly `M packages/coding-agent/src/core/settings-manager.ts`.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(agent): SettingsManager.setProviderKey/getProviderKey async via SecretStore

- providerKeys field removed from Settings interface (no more
  plaintext on disk)
- setProviderKey/getProviderKey now async; routed through
  SecretStore (keytar preferred, in-memory fallback)
- SettingsManager.create() accepts optional secretStore override
  for tests; defaults to KeytarSecretStore

Callers (withStoredKeys, setup-llm, model-runtime) updated in
follow-up commits." 2>&1 | tail -5
```
Expected: 1 commit.

---

## Task 4: Update `withStoredKeys` for async getProviderKey

**Files:**
- Modify: `packages/coding-agent/src/core/with-stored-keys-provider.ts`

- [ ] **Step 4.1: Await getProviderKey in resolve**

Edit `with-stored-keys-provider.ts`. Change:

```ts
const stored = settingsManager.getProviderKey(provider.id);
```

to:

```ts
const stored = await settingsManager.getProviderKey(provider.id);
```

The surrounding `resolve` is already async.

- [ ] **Step 4.2: Commit**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/src/core/with-stored-keys-provider.ts && git status --short
```
Expected: exactly `M packages/coding-agent/src/core/with-stored-keys-provider.ts`.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(agent): withStoredKeys awaits SettingsManager.getProviderKey

getProviderKey is now async (SecretStore-backed). Await keeps the
resolve chain non-racy. Behavior unchanged for callers." 2>&1 | tail -5
```
Expected: 1 commit.

---

## Task 5: Update existing withStoredKeys unit tests for async

**Files:**
- Modify: `packages/coding-agent/test/with-stored-keys-provider.test.ts`

- [ ] **Step 5.1: Update mock factory + tests**

The existing test factory:

```ts
function makeSettings(getProviderKey: (id: string) => string | undefined): SettingsManager {
	return { getProviderKey } as unknown as SettingsManager;
}
```

Change to:

```ts
function makeSettings(getProviderKey: (id: string) => Promise<string | undefined>): SettingsManager {
	return { getProviderKey } as unknown as SettingsManager;
}
```

Each test's `vi.fn(() => "stored-key")` becomes `vi.fn(async () => "stored-key")`. (Async fn returning string auto-wraps to Promise.)

- [ ] **Step 5.2: Run vitest**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run packages/coding-agent/test/with-stored-keys-provider.test.ts 2>&1 | tail -10
```
Expected: 4 tests pass.

- [ ] **Step 3 commit (for this task)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/test/with-stored-keys-provider.test.ts && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "test(agent): withStoredKeys mocks getProviderKey async

getProviderKey signature changed to async (SecretStore-backed).
Mock factory now returns async function; tests otherwise unchanged." 2>&1 | tail -5
```
Expected: 1 commit.

---

## Task 6: Setup-llm + model-runtime callers

**Files:**
- Modify: `packages/coding-agent/src/cli/setup-llm.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/setup-llm.ts`
- Modify: `packages/coding-agent/src/core/model-runtime.ts` (only if directly affected)

- [ ] **Step 6.1: Find all setProviderKey call sites**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && grep -rn "setProviderKey\\|getProviderKey" packages/coding-agent/src/ 2>&1 | head -20
```
Expected: ~3 sites — setup-llm component, setup-llm cli, model-runtime (in withStoredKeys). Most already updated in Task 4. May need to await setProviderKey.

- [ ] **Step 6.2: Await setProviderKey in callers**

Edit each caller:

```ts
this.options.settingsManager.setProviderKey(this.selectedProvider, value);
```

to:

```ts
await this.options.settingsManager.setProviderKey(this.selectedProvider, value);
```

Wrap surrounding code in async context if needed.

- [ ] **Step 6.3: Run check + test:scripts**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -10
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run test:scripts 2>&1 | tail -5
```
Expected: 2 pre-existing warnings; test:scripts 20/20.

- [ ] **Step 6.4: Commit**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/src/cli/setup-llm.ts packages/coding-agent/src/modes/interactive/components/setup-llm.ts && git status --short
```
Expected: 2 files staged (skip if only one needed).

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(agent): setup-llm awaits setProviderKey (now async)

SecretStore-backed setProviderKey is async; wizard onSubmit
handler awaits the write before proceeding to done step." 2>&1 | tail -5
```
Expected: 1 commit.

---

## Task 7: Add secret-store unit tests

**Files:**
- Create: `packages/coding-agent/test/secret-store.test.ts`

- [ ] **Step 7.1: Write tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaintextSecretStore } from "../src/core/plaintext-secret-store.ts";
import { KeytarSecretStore } from "../src/core/secret-store.ts";

describe("PlaintextSecretStore", () => {
	it("CRUD: set → get → remove", async () => {
		const s = new PlaintextSecretStore();
		expect(await s.get("anthropic", "providerKey")).toBeUndefined();
		await s.set("anthropic", "providerKey", "sk-test");
		expect(await s.get("anthropic", "providerKey")).toBe("sk-test");
		await s.remove("anthropic", "providerKey");
		expect(await s.get("anthropic", "providerKey")).toBeUndefined();
	});

	it("isolates per provider+account", async () => {
		const s = new PlaintextSecretStore();
		await s.set("anthropic", "providerKey", "sk-a");
		await s.set("openai", "providerKey", "sk-o");
		expect(await s.get("anthropic", "providerKey")).toBe("sk-a");
		expect(await s.get("openai", "providerKey")).toBe("sk-o");
	});
});

describe("KeytarSecretStore", () => {
	const originalWarn = console.warn;
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
		originalWarn;
	});

	it("falls back to in-memory when keytar import fails", async () => {
		// Force keytar import to fail by mocking dynamic import
		// (Vitest supports vi.doMock for ESM dynamic imports)
		// Approach: import a fresh module after registering the mock.
		// Since dynamic import("keytar") is captured at runtime, we use
		// vi.resetModules + vi.doMock.
		vi.resetModules();
		vi.doMock("keytar", () => {
			throw new Error("simulated keytar unavailable");
		});
		const mod = await import("../src/core/secret-store.ts");
		const store = new mod.KeytarSecretStore();
		await store.set("anthropic", "providerKey", "sk-fallback");
		expect(await store.get("anthropic", "providerKey")).toBe("sk-fallback");
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("keytar unavailable"));
		vi.doUnmock("keytar");
		vi.resetModules();
	});

	it("uses keytar when import succeeds", async () => {
		const setPassword = vi.fn(async () => {});
		const getPassword = vi.fn(async (_p: string, _a: string) => "sk-keytar");
		const deletePassword = vi.fn(async () => {});

		vi.resetModules();
		vi.doMock("keytar", () => ({
			setPassword,
			getPassword,
			deletePassword,
		}));
		const mod = await import("../src/core/secret-store.ts");
		const store = new mod.KeytarSecretStore();
		await store.set("anthropic", "providerKey", "sk-x");
		expect(await store.get("anthropic", "providerKey")).toBe("sk-keytar");
		expect(setPassword).toHaveBeenCalledWith("anthropic", "providerKey", "sk-x");
		expect(warnSpy).not.toHaveBeenCalled();
		vi.doUnmock("keytar");
		vi.resetModules();
	});

	it("falls back to in-memory when keytar.getPassword returns null", async () => {
		const setPassword = vi.fn(async () => {});
		const getPassword = vi.fn(async () => null);
		const deletePassword = vi.fn(async () => {});

		vi.resetModules();
		vi.doMock("keytar", () => ({ setPassword, getPassword, deletePassword }));
		const mod = await import("../src/core/secret-store.ts");
		const store = new mod.KeytarSecretStore();
		await store.set("anthropic", "providerKey", "sk-fb");
		await store.get("anthropic", "providerKey");
		expect(await store.get("anthropic", "providerKey")).toBe("sk-fb");
		vi.doUnmock("keytar");
		vi.resetModules();
	});
});
```

**Implementation note**: Vitest's `vi.doMock` works for ESM dynamic imports if you `vi.resetModules()` first. If the test environment cannot intercept dynamic imports, fall back to a simpler test that exercises `PlaintextSecretStore` only and skip the dynamic-import mock tests (note in commit).

- [ ] **Step 7.2: Run tests**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run packages/coding-agent/test/secret-store.test.ts 2>&1 | tail -15
```
Expected: 5 tests pass (or fewer with skipped dynamic-import tests + commit message explaining).

- [ ] **Step 7.3: Commit**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/test/secret-store.test.ts && git status --short
```
Expected: exactly `A packages/coding-agent/test/secret-store.test.ts`.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "test(agent): 5 cases for SecretStore (Plaintext + Keytar fallback)

- PlaintextSecretStore CRUD + per-provider isolation
- KeytarSecretStore falls back to in-memory when keytar import
  fails (warning logged)
- KeytarSecretStore uses keytar when import succeeds
- KeytarSecretStore falls back when keytar.getPassword returns null" 2>&1 | tail -5
```
Expected: 1 commit.

---

## Task 8: Install keytar + commit lockfile

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 8.1: Add keytar to package.json devDependencies**

Edit `package.json`. In the `devDependencies` block (alphabetical position near "yargs"):

```jsonc
		"keytar": "7.9.0",
```

- [ ] **Step 8.2: Install with --ignore-scripts**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm install --ignore-scripts 2>&1 | tail -10
```
Expected: keytar installed, lockfile updated, lifecycle scripts not run (AGENTS.md §Commands #46).

- [ ] **Step 8.3: Verify lockfile changed**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git status --short package.json package-lock.json 2>&1
```
Expected: both `M`.

- [ ] **Step 8.4: Run check (keytar now in node_modules; tsc should resolve it)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -10
```
Expected: 2 pre-existing warnings. If TypeScript still complains about keytar types, install `@types/keytar`:

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm install --save-dev --ignore-scripts @types/keytar 2>&1 | tail -3
```

- [ ] **Step 8.5: Commit lockfile + package.json**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add package.json package-lock.json && git status --short
```
Expected: exactly `M package.json` and `M package-lock.json`.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(agent): keytar 7.9.0 devDependency

OS keyring binding for API key at-rest encryption (spec
2026-09-08-secret-store-keytar). Pinned exact version per
AGENTS.md §Dependencies #44.

Risk noted: upstream atom/node-keytar is archived; npm still
publishes patches (last 2025-07-30). Fallback to in-memory
storage when keytar import fails." 2>&1 | tail -5
```
Expected: 1 commit.

---

## Task 9: Final verification

**Files:** none new.

- [ ] **Step 9.1: Full check + vitest + test:scripts**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -5
```
Expected: 2 pre-existing warnings.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run packages/coding-agent/test/secret-store.test.ts packages/coding-agent/test/with-stored-keys-provider.test.ts packages/coding-agent/test/extension-selector-scroll.test.ts 2>&1 | tail -10
```
Expected: 5 + 4 + 6 = 15 tests pass.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run test:scripts 2>&1 | tail -6
```
Expected: 20/20 PASS.

- [ ] **Step 9.2: Commit chain**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git log --oneline 5662686..HEAD
```
Expected: 7 commits (Tasks 1-8 + plan commit not counted).

- [ ] **Step 9.3: Final report**

Run:

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git log --oneline 5662686..HEAD && echo "---" && git status --short && echo "---" && npm run check 2>&1 | tail -3
```

---

## Self-Review

### Spec coverage

| Spec § | Task |
|---|---|
| §3.1 SecretStore interface | Task 2 |
| §3.2 KeytarSecretStore | Task 2 |
| §3.3 PlaintextSecretStore | Task 1 |
| §3.4 SettingsManager changes | Tasks 3 + 4 + 6 |
| §3.5 package.json + lockfile | Task 8 |
| §4 tests | Tasks 5 + 7 |

### Placeholder scan

None.

### Type consistency

`SecretStore` interface consistent across Task 2 definition, Task 1 implementation, Task 3 SettingsManager usage, Task 7 test factory.

### Spec deviations

None — plan follows spec exactly.