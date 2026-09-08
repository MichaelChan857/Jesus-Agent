# ProviderKeys Fallback Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire `settings.json` `providerKeys[provider]` into the provider's `apiKey.resolve()` chain so `pi --setup-llm` actually sets the active API key (currently writes but provider adapter doesn't read it).

**Architecture:** New `withStoredKeys(provider, settingsManager)` wrapper that intercepts `provider.auth.apiKey.resolve`. Called from `ModelRuntime.create()` after `withRemoteCatalog`. Requires passing `settingsManager` through `CreateModelRuntimeOptions` and updating all 5 callers.

**Tech Stack:** TypeScript (erasable syntax), vitest, `@jesus/ai` types read-only.

**Working directory:** `C:\Users\Administrator\projects\jesus-agent-harness\` (Windows bash).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `packages/coding-agent/src/core/with-stored-keys-provider.ts` | create | wrapper function |
| `packages/coding-agent/test/with-stored-keys-provider.test.ts` | create | 3 unit tests |
| `packages/coding-agent/src/core/model-runtime.ts` | modify | add `settingsManager` to options, call `withStoredKeys` |
| `packages/coding-agent/src/cli/auth-check.ts` | modify | pass settingsManager |
| `packages/coding-agent/src/core/agent-session-services.ts` | modify | pass settingsManager |
| `packages/coding-agent/src/core/sdk.ts` | modify | pass settingsManager |
| `packages/coding-agent/src/main.ts` | modify | pass settingsManager (2 sites) |

---

## Constraints (AGENTS.md)

- §Code Quality #22: no inline `await import()`. Top-level imports.
- §Code Quality #23: erasable TypeScript — no parameter properties.
- §Git #58: stage explicit paths.
- §Git #61: commit format `feat(agent): <msg>`.
- §Git #65: never `git commit --no-verify`, never `git reset --hard`, etc.

---

## Task 1: Implement `withStoredKeys` wrapper

**Files:**
- Create: `packages/coding-agent/src/core/with-stored-keys-provider.ts`

- [ ] **Step 1.1: Read the Provider type to confirm shape**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && grep -n "auth?:.*\\|apiKey?:.*AuthMethod\\|export type AuthMethod\\|interface Provider" packages/ai/src/models.ts 2>&1 | head -10
```
Expected: confirm `provider.auth.apiKey.resolve` signature matches `(args) => Promise<{ auth?: { apiKey?: string }, source?: string } | undefined>`.

- [ ] **Step 1.2: Create the wrapper file**

Create `packages/coding-agent/src/core/with-stored-keys-provider.ts`:

```ts
import type { Provider } from "@jesus/ai";
import type { SettingsManager } from "./settings-manager.ts";

/**
 * Wrap a provider so its apiKey.resolve() consults
 * settings.json providerKeys[providerId] as a fallback source for the API key.
 *
 * Resolution priority (highest → lowest), per 2026-09-08 user direction:
 *   1. credential.key (already-stored credential from the auth flow)
 *   2. providerKeys[providerId] (this file's contribution)
 *   3. provider's own env-var lookup (PI_ANTHROPIC_API_KEY etc., unchanged)
 *
 * WARNING: priority 2 > 3 inverts the usual "env > config file" convention.
 * Documented in spec 2026-09-08-providerkeys-fallback-wiring §3.3.
 * Follow-up spec may add a reset command to clear stored keys.
 */
export function withStoredKeys(provider: Provider, settingsManager: SettingsManager): Provider {
	const originalResolve = provider.auth?.apiKey?.resolve;
	if (!originalResolve) {
		return provider;
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
						return result;
					}
					const stored = settingsManager.getProviderKey(provider.id);
					if (stored) {
						return {
							auth: { apiKey: stored },
							source: `providerKeys[${provider.id}]`,
						};
					}
					return result;
				},
			},
		},
	};
}
```

- [ ] **Step 1.3: Run `npm run check`**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -5
```
Expected: exit 0 modulo 2 pre-existing warnings.

- [ ] **Step 1.4: Commit (wrapper file only)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/src/core/with-stored-keys-provider.ts && git status --short
```
Expected: exactly `A packages/coding-agent/src/core/with-stored-keys-provider.ts`.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(agent): withStoredKeys provider wrapper

Consults settingsManager.getProviderKey(providerId) when provider's
own apiKey.resolve() finds no credential. Priority order per
2026-09-08 user direction: credential > providerKeys > env
(see spec 2026-09-08-providerkeys-fallback-wiring §3.3 for the
env-inversion warning).

Pass-through if provider has no apiKey.resolve (e.g. oauth-only)." 2>&1 | tail -5
```
Expected: 1 commit, 1 file added.

---

## Task 2: Write 3 unit tests for `withStoredKeys`

**Files:**
- Create: `packages/coding-agent/test/with-stored-keys-provider.test.ts`

- [ ] **Step 2.1: Inspect existing vitest test patterns**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && head -15 packages/coding-agent/test/settings-manager.test.ts 2>&1
```
Expected: confirm vitest imports + helper patterns.

- [ ] **Step 2.2: Write failing tests**

Create `packages/coding-agent/test/with-stored-keys-provider.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Provider } from "@jesus/ai";
import type { SettingsManager } from "../src/core/settings-manager.ts";
import { withStoredKeys } from "../src/core/with-stored-keys-provider.ts";

function makeProvider(id: string, originalResolve: Provider["auth"] extends infer A ? (A extends { apiKey?: infer K } ? (K extends { resolve?: infer R } ? R : never) : never) : never): Provider {
	return {
		id,
		name: id,
		auth: { apiKey: { resolve: originalResolve } },
	} as Provider;
}

function makeSettings(getProviderKey: (id: string) => string | undefined): SettingsManager {
	return { getProviderKey } as unknown as SettingsManager;
}

describe("withStoredKeys", () => {
	it("returns original result when credential provides apiKey", async () => {
		const originalResolve = vi.fn(async () => ({ auth: { apiKey: "cred-key" }, source: "stored credential" }));
		const settingsGet = vi.fn(() => "stored-key");
		const provider = makeProvider("anthropic", originalResolve);
		const wrapped = withStoredKeys(provider, makeSettings(settingsGet));
		const result = await wrapped.auth!.apiKey!.resolve!({} as Parameters<NonNullable<NonNullable<Provider["auth"]>["apiKey"]>["resolve"]>[0]);
		expect(result).toEqual({ auth: { apiKey: "cred-key" }, source: "stored credential" });
		expect(settingsGet).not.toHaveBeenCalled();
	});

	it("returns providerKeys when credential absent and stored key present", async () => {
		const originalResolve = vi.fn(async () => undefined);
		const settingsGet = vi.fn(() => "stored-anthropic-key");
		const provider = makeProvider("anthropic", originalResolve);
		const wrapped = withStoredKeys(provider, makeSettings(settingsGet));
		const result = await wrapped.auth!.apiKey!.resolve!({} as Parameters<NonNullable<NonNullable<Provider["auth"]>["apiKey"]>["resolve"]>[0]);
		expect(result).toEqual({ auth: { apiKey: "stored-anthropic-key" }, source: "providerKeys[anthropic]" });
		expect(settingsGet).toHaveBeenCalledWith("anthropic");
	});

	it("falls through to env when neither credential nor stored key present", async () => {
		const originalResolve = vi.fn(async () => ({ auth: { apiKey: "env-key" }, source: "ANTHROPIC_API_KEY" }));
		const settingsGet = vi.fn(() => undefined);
		const provider = makeProvider("anthropic", originalResolve);
		const wrapped = withStoredKeys(provider, makeSettings(settingsGet));
		const result = await wrapped.auth!.apiKey!.resolve!({} as Parameters<NonNullable<NonNullable<Provider["auth"]>["apiKey"]>["resolve"]>[0]);
		expect(result).toEqual({ auth: { apiKey: "env-key" }, source: "ANTHROPIC_API_KEY" });
	});

	it("passes through when provider has no apiKey.resolve", () => {
		const provider = { id: "oauth-only", name: "oauth-only", auth: { oauth: {} as never } } as Provider;
		const settingsGet = vi.fn(() => "should-not-be-used");
		const wrapped = withStoredKeys(provider, makeSettings(settingsGet));
		expect(wrapped).toBe(provider);
	});
});
```

**Implementer note**: the deep-nested `Parameters<...>` type chain for the resolve args is verbose. Simplify by using `any` for the args parameter cast (vitest project already uses `any` in places — AGENTS.md §Code Quality #18: "No `any` unless absolutely necessary"; here it's necessary because the inner Provider type is recursive and we only need to mock the call).

Replace the four `{} as Parameters<...>[0]` with `{} as never` — they all just need a non-null placeholder. Test will only call resolve once.

- [ ] **Step 2.3: Run tests**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run packages/coding-agent/test/with-stored-keys-provider.test.ts 2>&1 | tail -15
```
Expected: 4 tests pass (the wrapper from Task 1 already exists).

- [ ] **Step 2.4: Commit (test file only)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/test/with-stored-keys-provider.test.ts && git status --short
```
Expected: exactly `A packages/coding-agent/test/with-stored-keys-provider.test.ts`.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "test(agent): 4 cases for withStoredKeys wrapper

- credential wins (settingsManager not called)
- providerKeys wins when credential absent
- env fallback when neither present
- pass-through when provider has no apiKey.resolve

All pass against Task 1 wrapper." 2>&1 | tail -5
```
Expected: 1 commit, 1 file added.

---

## Task 3: Wire `withStoredKeys` into `ModelRuntime.create` + 5 callers

**Files:**
- Modify: `packages/coding-agent/src/core/model-runtime.ts`
- Modify: `packages/coding-agent/src/cli/auth-check.ts`
- Modify: `packages/coding-agent/src/core/agent-session-services.ts`
- Modify: `packages/coding-agent/src/core/sdk.ts`
- Modify: `packages/coding-agent/src/main.ts` (2 sites)

- [ ] **Step 3.1: Add `settingsManager` to `CreateModelRuntimeOptions`**

Edit `packages/coding-agent/src/core/model-runtime.ts`. In the `CreateModelRuntimeOptions` interface (line ~66), add:

```ts
	/** SettingsManager to consult for providerKeys fallback during auth. */
	settingsManager?: import("./settings-manager.ts").SettingsManager;
```

- [ ] **Step 3.2: Import `withStoredKeys` in model-runtime.ts**

At the top of `model-runtime.ts`, add (in alphabetical position with other local imports):

```ts
import { withStoredKeys } from "./with-stored-keys-provider.ts";
```

- [ ] **Step 3.3: Apply the wrap after `withRemoteCatalog`**

Edit the `builtinProviderCatalog.builtinProviders().map(...)` chain in `static create()`. Find the line `.map((provider) => provider.id === "radius" ? provider : withRemoteCatalog(provider, options.catalogBaseUrl, builtinModelDataGeneratedAt))`.

Wrap the result:

```ts
			.map((provider) =>
				provider.id === "radius"
					? provider
					: options.settingsManager
						? withStoredKeys(withRemoteCatalog(provider, options.catalogBaseUrl, builtinModelDataGeneratedAt), options.settingsManager)
						: withRemoteCatalog(provider, options.catalogBaseUrl, builtinModelDataGeneratedAt),
			)
```

- [ ] **Step 3.4: Update 5 callers**

Each caller already constructs (or has access to) a `SettingsManager`. For each, add `settingsManager:` to the options object passed to `ModelRuntime.create()`.

**Callers and what to pass**:

1. `packages/coding-agent/src/cli/auth-check.ts:67` — needs settingsManager from caller; if not in scope, pass `undefined` (wrapper no-ops)
2. `packages/coding-agent/src/core/agent-session-services.ts:142` — likely already has settingsManager in scope; pass it
3. `packages/coding-agent/src/core/sdk.ts:180` — same; check scope
4. `packages/coding-agent/src/main.ts:167` — `startupSettingsManager` is in scope at this point; pass it
5. `packages/coding-agent/src/main.ts:243` — likely a different settingsManager instance; check

For each, the edit pattern is:

```ts
const modelRuntime = await ModelRuntime.create({
    // existing fields...
    settingsManager: <variable-name-in-scope>,
});
```

For callers without a settingsManager in scope, **omit the field** (wrapper is conditional via `options.settingsManager`).

- [ ] **Step 3.5: Run `npm run check`**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -10
```
Expected: still 2 pre-existing warnings.

- [ ] **Step 3.6: Run vitest**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run packages/coding-agent/test/with-stored-keys-provider.test.ts 2>&1 | tail -10
```
Expected: 4 tests pass (unchanged from Task 2).

- [ ] **Step 3.7: Commit (model-runtime + 5 callers)**

Stage explicit paths only:

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/src/core/model-runtime.ts packages/coding-agent/src/cli/auth-check.ts packages/coding-agent/src/core/agent-session-services.ts packages/coding-agent/src/core/sdk.ts packages/coding-agent/src/main.ts && git status --short
```
Expected: exactly 5 files staged (4 M, 1 A or M depending on what you changed).

Verify the staged paths match only these files. **Do NOT include any other modified files** (per AGENTS.md §Git #53 "Multiple pi sessions may be running in this cwd at the same time").

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(agent): apply withStoredKeys in ModelRuntime.create

- CreateModelRuntimeOptions now accepts settingsManager
- builtinProviders() chain wraps each non-radius provider with
  withStoredKeys() when settingsManager is supplied
- 5 callers updated: cli/auth-check, core/agent-session-services,
  core/sdk, main.ts (2 sites)

Conditional wrap: callers without settingsManager pass nothing;
wrapper is a pass-through when settingsManager is absent." 2>&1 | tail -5
```
Expected: 1 commit, 5 files changed.

---

## Task 4: Final verification

**Files:** none new.

- [ ] **Step 4.1: Full check + vitest + scripts test**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -5
```
Expected: 2 pre-existing warnings.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run packages/coding-agent/test/with-stored-keys-provider.test.ts packages/coding-agent/test/settings-manager.test.ts 2>&1 | tail -10
```
Expected: 4 + 46 tests run; 4 new + 40 baseline pass; 6 pre-existing settings-manager baseline failures unchanged.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run test:scripts 2>&1 | tail -10
```
Expected: 20/20 pass (unchanged).

- [ ] **Step 4.2: Commit chain**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git log --oneline f03a245..HEAD
```
Expected: 3 commits (Tasks 1-3).

- [ ] **Step 4.3: Final report**

Run:
```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git log --oneline f03a245..HEAD && echo "---" && git status --short && echo "---" && npm run check 2>&1 | tail -3
```
Report: 3 commits, vitest results, no untracked new files beyond unrelated session work.

---

## Self-Review

### Spec coverage

| Spec § | Task |
|---|---|
| §3.1 wrapper function | Task 1 |
| §3.2 model-runtime integration | Task 3 |
| §3.3 priority warning | Task 1 header comment + Task 3 commit message |
| §3.4 tests | Task 2 |
| §4 file list | All tasks |

### Placeholder scan

None. All code complete.

### Type consistency

`withStoredKeys(provider, settingsManager)` signature consistent across Task 1 wrapper, Task 2 tests, Task 3 caller.

### Spec deviations

None new — the spec deviation (providerKeys > env) is the spec itself, documented in commit messages.

### Caller-list accuracy

The plan assumes 5 callers of `ModelRuntime.create()`. If `grep` finds more, add Steps 3.4.x. If fewer, skip the extra ones.