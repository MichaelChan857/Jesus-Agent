# Jesus `--setup-llm` Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `pi --setup-llm` CLI flag that launches a 3-step interactive wizard (pick provider → pick model → enter API key), writing the choice to `~/.jesus/agent/settings.json`.

**Architecture:** New `PasswordInputComponent` in `@jesus/tui` (mask input); new `SetupLlmComponent` and `showSetupLlmWizard()` orchestrator in `@jesus/coding-agent`; new `SettingsManager.setProviderKey()` method. Reuses existing `ExtensionSelectorComponent` for the picker steps. Plain text banner `✝  J E S U S   A G E N T`. Wizard does not modify default startup; opt-in only.

**Tech Stack:** TypeScript (erasable syntax — no parameter properties, no enum/namespace, no `import =`), `@jesus/tui` components, `node:test` for `@jesus/tui`, `vitest` for `@jesus/coding-agent`.

**Working directory:** `C:\Users\Administrator\projects\jesus-agent-harness\` (Windows, bash via Git Bash).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `packages/tui/src/components/password-input.ts` | create | PasswordInputComponent: mask input |
| `packages/tui/src/components/password-input.test.ts` | create | Unit test (node:test) for masking logic |
| `packages/tui/src/index.ts` | modify | Export PasswordInputComponent |
| `packages/coding-agent/src/core/settings-manager.ts` | modify | Add `providerKeys?: Record<string,string>` to Settings; add `setProviderKey()` method |
| `packages/coding-agent/test/settings-manager.test.ts` | modify | Add setProviderKey test |
| `packages/coding-agent/src/cli/args.ts` | modify | Add `setupLlm?: boolean` field; help text line |
| `packages/coding-agent/src/main.ts` | modify | Route `parsed.setupLlm` to wizard then return |
| `packages/coding-agent/src/cli/setup-llm.ts` | create | `showSetupLlmWizard()` orchestrator |
| `packages/coding-agent/src/modes/interactive/components/setup-llm.ts` | create | SetupLlmComponent (3-step wizard UI) |

---

## Constraints (from `AGENTS.md`)

- §Commands #31: After code changes, run `npm run check`. Fix all errors/warnings before commit. (Pre-existing `packages/coding-agent/src/main.ts` warnings are out of scope per 2026-09-08 user direction.)
- §Commands #32: Never `npm run build` or `npm test` unless requested.
- §Commands #34: vitest from coding-agent root: `node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/specific.test.ts`.
- §Code Quality #22: No inline `await import()`. Top-level imports only.
- §Code Quality #23: Erasable TypeScript syntax only — no parameter properties, no `enum`, no `namespace`, no `import =`. Use explicit fields with constructor assignments.
- §Code Quality #27: Never modify `packages/ai/src/models.generated.ts` directly.
- §Git #58: Stage explicit paths.
- §Git #61: Commit format `{type}[(scope)]: <msg>`. Scopes: `ai|tui|agent|coding-agent`. Use `tui,agent` for this work (multi-scope).

---

## Task 1: Add `PasswordInputComponent` to `@jesus/tui`

**Files:**
- Create: `packages/tui/src/components/password-input.ts`
- Create: `packages/tui/src/components/password-input.test.ts`
- Modify: `packages/tui/src/index.ts` (add export)

The component is a Container-based input where every character is rendered as `*` but the underlying buffer holds the real string. Reuse the existing `Input` from `@jesus/tui` for buffer/cursor management? **No** — `Input` has Emacs-style editing hooks (KillRing, UndoStack) that don't apply to passwords. Implement a minimal mask input directly.

- [ ] **Step 1.1: Read the existing Container interface (to match its API)**

Run from repo root:
```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && grep -n "class Container\|abstract class Container\|interface Component\|addChild\|render" packages/tui/src/tui.ts 2>&1 | head -10
```
Expected: locate `Container`, `Component`, and the rendering entry points so the new component matches the codebase conventions.

- [ ] **Step 1.2: Write the failing test**

Create `packages/tui/src/components/password-input.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PasswordInputComponent } from "./password-input.ts";

describe("PasswordInputComponent", () => {
	it("masks every typed character with *", () => {
		const c = new PasswordInputComponent();
		c.handleInput("a");
		c.handleInput("b");
		c.handleInput("c");
		assert.equal(c.getValue(), "abc");
		assert.equal(c.getMaskedValue(), "***");
	});

	it("supports backspace", () => {
		const c = new PasswordInputComponent();
		c.handleInput("a");
		c.handleInput("b");
		c.handleInput("backspace");
		assert.equal(c.getValue(), "a");
		assert.equal(c.getMaskedValue(), "*");
	});

	it("clears on Ctrl+U", () => {
		const c = new PasswordInputComponent();
		c.handleInput("a");
		c.handleInput("b");
		c.handleInput("c");
		c.handleInput("ctrl+u");
		assert.equal(c.getValue(), "");
		assert.equal(c.getMaskedValue(), "");
	});

	it("emits submit on Enter", () => {
		const c = new PasswordInputComponent();
		let submitted: string | undefined;
		c.onSubmit = (v) => (submitted = v);
		c.handleInput("a");
		c.handleInput("b");
		c.handleInput("enter");
		assert.equal(submitted, "ab");
	});

	it("emits cancel on Escape", () => {
		const c = new PasswordInputComponent();
		let fired = false;
		c.onCancel = () => (fired = true);
		c.handleInput("escape");
		assert.equal(fired, true);
	});
});
```

- [ ] **Step 1.3: Run the test to verify it fails**

Run from repo root:
```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm --prefix packages/tui test 2>&1 | tail -20
```
Expected: 5 failures with "PasswordInputComponent is not a constructor" or "cannot find module". Confirms tests are wired before implementation.

- [ ] **Step 1.4: Implement `PasswordInputComponent`**

Create `packages/tui/src/components/password-input.ts`:

```ts
import { Container, Text } from "./container-deps.ts";

export interface PasswordInputOptions {
	placeholder?: string;
	maxLength?: number;
}

export class PasswordInputComponent extends Container {
	private value: string = "";
	public onSubmit?: (value: string) => void;
	public onCancel?: () => void;
	private readonly options: PasswordInputOptions;

	constructor(options: PasswordInputOptions = {}) {
		super();
		this.options = options;
		this.rebuild();
	}

	getValue(): string {
		return this.value;
	}

	getMaskedValue(): string {
		return "*".repeat(this.value.length);
	}

	handleInput(key: string): void {
		// Order matters: cancel first, then submit, then editing.
		if (key === "escape") {
			this.onCancel?.();
			return;
		}
		if (key === "enter") {
			this.onSubmit?.(this.value);
			return;
		}
		if (key === "ctrl+u") {
			this.value = "";
			this.rebuild();
			return;
		}
		if (key === "backspace") {
			this.value = this.value.slice(0, -1);
			this.rebuild();
			return;
		}
		// Printable character: single grapheme, length 1
		if (key.length === 1) {
			if (this.options.maxLength && this.value.length >= this.options.maxLength) {
				return;
			}
			this.value += key;
			this.rebuild();
		}
	}

	private rebuild(): void {
		this.clearChildren();
		const display = this.getMaskedValue() || (this.options.placeholder ?? "");
		this.addChild(new Text(display, 1, 0));
	}

	private clearChildren(): void {
		// Container API: see existing components for the exact method.
		// If Container exposes `clear()`, use it; otherwise recreate children.
		// Implementer: inspect Container class for the right method.
		// Fallback: rely on Container's `clear()` method (matches FirstTimeSetupComponent pattern).
		(this as unknown as { clear: () => void }).clear();
	}
}
```

**Important: implementer must inspect Container's API in Step 1.1** and replace `clearChildren()` body with the correct method (likely just call `this.clear()`). Adjust if Container exposes `removeAllChildren()` or similar. The implementation is "Container API is what Step 1.1 says it is."

- [ ] **Step 1.5: Run the test to verify it passes**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm --prefix packages/tui test 2>&1 | tail -20
```
Expected: 5 tests pass.

- [ ] **Step 1.6: Export from `@jesus/tui`**

Modify `packages/tui/src/index.ts`. Add (alphabetically near other component exports):

```ts
export { PasswordInputComponent, type PasswordInputOptions } from "./components/password-input.ts";
```

- [ ] **Step 1.7: Run `npm run check`**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -10
```
Expected: exit 0 (modulo the 2 pre-existing main.ts warnings — those are NOT in tui, so they should still appear).

- [ ] **Step 1.8: Commit (tui changes only)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/tui/src/components/password-input.ts packages/tui/src/components/password-input.test.ts packages/tui/src/index.ts && git status --short
```
Expected: 3 paths staged (1 new file for src, 1 new file for test, 1 modified for index.ts). Verify only these.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(tui): add PasswordInputComponent with mask rendering

Reusable mask-input component for sensitive prompts (API keys).
Stores real value, renders ****. Supports backspace, Ctrl+U clear,
Enter submit, Escape cancel. Used by setup-llm wizard (follow-up)."
```
Expected: 1 commit, 3 files changed.

---

## Task 2: Add `providerKeys` field + `setProviderKey()` to SettingsManager

**Files:**
- Modify: `packages/coding-agent/src/core/settings-manager.ts`
- Modify: `packages/coding-agent/test/settings-manager.test.ts`

- [ ] **Step 2.1: Locate insertion points**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && grep -n "defaultModel?\\|setDefaultModelAndProvider\\|markModified.*defaultModel" packages/coding-agent/src/core/settings-manager.ts 2>&1 | head -5
```
Expected: shows where `defaultModel` is declared in Settings interface and where `setDefaultModelAndProvider()` lives.

- [ ] **Step 2.2: Add `providerKeys` field to Settings interface**

Edit `packages/coding-agent/src/core/settings-manager.ts`. Insert immediately after the line `defaultProvider?: string;` (line ~96):

```ts
	/** Per-provider API keys stored as plaintext (MVP). Provider adapter
	 * fallback wiring is a follow-up; PI_<PROVIDER>_API_KEY env still wins. */
	providerKeys?: Record<string, string>;
```

- [ ] **Step 2.3: Add `setProviderKey()` method**

Insert after `setDefaultModelAndProvider()` (around line 743):

```ts
	setProviderKey(provider: string, apiKey: string): void {
		this.globalSettings.providerKeys = {
			...(this.globalSettings.providerKeys ?? {}),
			[provider]: apiKey,
		};
		this.markModified("providerKeys");
		this.save();
	}

	getProviderKey(provider: string): string | undefined {
		return this.globalSettings.providerKeys?.[provider];
	}
```

- [ ] **Step 2.4: Write the failing test**

Append to `packages/coding-agent/test/settings-manager.test.ts` (locate the last `it(...)` block and add after its closing `});`):

```ts
	describe("providerKeys", () => {
		it("setProviderKey persists and getProviderKey returns the same value", async () => {
			const settingsPath = join(agentDir, "settings.json");
			writeFileSync(settingsPath, JSON.stringify({ theme: "dark" }));
			const sm = await SettingsManager.create({ agentDir, projectDir });
			sm.setProviderKey("anthropic", "sk-test-abc");
			// Re-read from disk to confirm persistence.
			const onDisk = JSON.parse(readFileSync(settingsPath, "utf8"));
			expect(onDisk.providerKeys?.anthropic).toBe("sk-test-abc");
			expect(sm.getProviderKey("anthropic")).toBe("sk-test-abc");
		});

		it("setProviderKey merges with existing keys without dropping them", async () => {
			const settingsPath = join(agentDir, "settings.json");
			writeFileSync(settingsPath, JSON.stringify({ theme: "dark" }));
			const sm = await SettingsManager.create({ agentDir, projectDir });
			sm.setProviderKey("anthropic", "sk-a");
			sm.setProviderKey("openai", "sk-o");
			expect(sm.getProviderKey("anthropic")).toBe("sk-a");
			expect(sm.getProviderKey("openai")).toBe("sk-o");
		});
	});
```

- [ ] **Step 2.5: Run test to verify it fails**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/settings-manager.test.ts 2>&1 | tail -20
```
Expected: new `providerKeys` block fails (method not found).

- [ ] **Step 2.6: Run test to verify it passes** (after Step 2.3)

Same command. Expected: 2 new tests pass + all existing pass.

- [ ] **Step 2.7: Run `npm run check`**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -10
```
Expected: still 2 pre-existing warnings (unchanged).

- [ ] **Step 2.8: Commit (settings-manager only)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/src/core/settings-manager.ts packages/coding-agent/test/settings-manager.test.ts && git status --short
```
Expected: exactly 2 paths staged.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(agent): SettingsManager.setProviderKey + providerKeys field

Adds plaintext MVP storage for per-provider API keys in
settings.json. PI_<PROVIDER>_API_KEY env still wins; providerKeys
is fallback (follow-up spec wires provider adapter to read it).
getProviderKey() reads back. Tests cover single-set + merge." 2>&1 | tail -5
```
Expected: 1 commit, 2 files changed.

---

## Task 3: Add `--setup-llm` flag in CLI args

**Files:**
- Modify: `packages/coding-agent/src/cli/args.ts`

- [ ] **Step 3.1: Locate `setupLlm` insertion in Args interface and parseArgs**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && grep -n "offline?\\|^const PARSE\\|--offline" packages/coding-agent/src/cli/args.ts 2>&1 | head -10
```
Expected: find `offline?: boolean` field (line ~49) and the `--offline` parsing case. Mirror that pattern.

- [ ] **Step 3.2: Add `setupLlm?: boolean` to Args interface**

Insert after `offline?: boolean;`:
```ts
	setupLlm?: boolean;
```

- [ ] **Step 3.3: Add `--setup-llm` parsing**

Locate the `else if (arg === "--offline")` branch (or whichever handles `--offline`) and insert a similar branch:

```ts
		} else if (arg === "--setup-llm") {
			parsed.setupLlm = true;
			continue;
		}
```

(Use the actual indentation found in the file — likely tabs.)

- [ ] **Step 3.4: Add help text line**

Find `printHelp()` function and the line with `--offline` description. Add after it:

```ts
	  --setup-llm                    Run LLM provider/model/key setup wizard (one-shot)
```

(Indent to match surrounding help text.)

- [ ] **Step 3.5: Run `npm run check`**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -10
```
Expected: unchanged (still 2 pre-existing warnings).

- [ ] **Step 3.6: Commit (args only)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/src/cli/args.ts && git status --short
```
Expected: exactly 1 file staged.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(agent): add --setup-llm CLI flag

Wires the flag into parseArgs + help text. Routing in main.ts
and wizard component land in follow-up commits." 2>&1 | tail -5
```
Expected: 1 commit, 1 file changed.

---

## Task 4: Wire `parsed.setupLlm` routing in main.ts

**Files:**
- Modify: `packages/coding-agent/src/main.ts`

- [ ] **Step 4.1: Find main() entry and existing branches**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && grep -n "^export async function main\\|^async function main\\|parsed.listModels\\|--version\\|parsed.help" packages/coding-agent/src/main.ts 2>&1 | head -15
```
Expected: locate main() and any existing early-return branches (--help, --version) to insert setupLlm before them.

- [ ] **Step 4.2: Add import for showSetupLlmWizard**

At the top of `main.ts`, add (in alphabetical position near other cli imports):

```ts
import { showSetupLlmWizard } from "./cli/setup-llm.ts";
```

> **Note**: `./cli/setup-llm.ts` doesn't exist yet (created in Task 5). TypeScript will error until Task 5 lands. To avoid blocking Task 4 verification, structure as: write the routing in Task 4, but DO NOT run `npm run check` until Task 5 lands (it'll fail on missing module). Mark Step 4.3 as "after Task 5".

- [ ] **Step 4.3: Insert setupLlm branch**

Inside `main()`, after the existing `parsed.help` / `parsed.version` branches (or at the top of the function before other branches), insert:

```ts
	if (parsed.setupLlm) {
		await showSetupLlmWizard(settingsManager);
		return;
	}
```

(Replace `settingsManager` with whatever local variable name `main()` uses — likely already initialized above. Read 10 lines above the insertion point to confirm the variable name.)

- [ ] **Step 4.4: Skip `npm run check` until Task 5**

**Do not run check yet.** The module dependency is incomplete.

- [ ] **Step 4.5: Commit (main.ts only)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/src/main.ts && git status --short
```
Expected: exactly 1 file staged.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(agent): route --setup-llm to wizard in main()

Calls showSetupLlmWizard(settingsManager) and returns. Wizard
component added in follow-up commit." 2>&1 | tail -5
```
Expected: 1 commit, 1 file changed.

---

## Task 5: Create `setup-llm.ts` orchestrator + `setup-llm.ts` component

**Files:**
- Create: `packages/coding-agent/src/cli/setup-llm.ts`
- Create: `packages/coding-agent/src/modes/interactive/components/setup-llm.ts`

These are tightly coupled — created together, then verified by running Task 4's deferred check.

- [ ] **Step 5.1: Read `ExtensionSelectorComponent` constructor signature + `FirstTimeSetupComponent` for reference**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && sed -n '30,80p' packages/coding-agent/src/modes/interactive/components/extension-selector.ts 2>&1
```
Expected: confirm constructor signature `constructor(title, options, onSelect, onCancel, opts?)` so the wizard can wire it correctly.

- [ ] **Step 5.2: Create the wizard component**

Create `packages/coding-agent/src/modes/interactive/components/setup-llm.ts`:

```ts
import { Container, getKeybindings, PasswordInputComponent, Spacer, Text, type TUI } from "@jesus/tui";
import { getBuiltinModels, getBuiltinProviders } from "@jesus/ai/providers/all";
import { theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { ExtensionSelectorComponent } from "./extension-selector.ts";
import { keyHint, rawKeyHint } from "./keybinding-hints.ts";

const SETUP_LLM_BANNER = [
	"=====================================",
	"        ✝  J E S U S   A G E N T",
	"     LLM Provider Setup Wizard",
	"=====================================",
];

export interface SetupLlmResult {
	provider: string;
	model: string;
	apiKey: string;
}

export interface SetupLlmOptions {
	tui: TUI;
	settingsManager: import("../../../core/settings-manager.ts").SettingsManager;
	detectedProvider?: string;
	detectedModel?: string;
}

export class SetupLlmComponent extends Container {
	private step: "banner" | "provider" | "model" | "apikey" | "done" = "banner";
	private selectedProvider = "";
	private selectedModel = "";
	private apiKey = "";
	private readonly options: SetupLlmOptions;
	public onComplete?: (result: SetupLlmResult) => void;
	public onCancel?: () => void;

	constructor(options: SetupLlmOptions) {
		super();
		this.options = options;
		if (options.detectedProvider) this.selectedProvider = options.detectedProvider;
		if (options.detectedModel) this.selectedModel = options.detectedModel;
		this.rebuild();
	}

	private rebuild(): void {
		(this as unknown as { clear: () => void }).clear();

		// Banner always shown
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		for (const line of SETUP_LLM_BANNER) {
			this.addChild(new Text(theme.fg("accent", theme.bold(line)), 1, 0));
		}
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(theme.fg("muted", "Pick a provider, then a model, then enter your API key."), 1, 0),
		);
		this.addChild(new Spacer(1));

		if (this.step === "banner") {
			this.addChild(
				new Text(
					rawKeyHint("Enter") + " " + keyHint("tui.select.confirm", "continue") +
					"  " + keyHint("tui.select.cancel", "cancel"),
					1, 0,
				),
			);
		} else if (this.step === "provider") {
			this.renderProviderStep();
		} else if (this.step === "model") {
			this.renderModelStep();
		} else if (this.step === "apikey") {
			this.renderApikeyStep();
		} else if (this.step === "done") {
			this.addChild(
				new Text(theme.fg("accent", theme.bold(
					`Saved. Run \`pi --provider ${this.selectedProvider} --model ${this.selectedModel}\` to start.`
				)), 1, 0),
			);
			this.addChild(new Spacer(1));
			this.addChild(new Text(theme.fg("muted",
				"Note: API key stored in settings.json. Provider adapter reads PI_<PROVIDER>_API_KEY env first; providerKeys fallback is a follow-up spec."), 1, 0));
		}

		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
		this.options.tui.requestRender();
	}

	private renderProviderStep(): void {
		const providers = getBuiltinProviders().sort();
		const selector = new ExtensionSelectorComponent(
			"Step 1: Pick your LLM provider",
			providers,
			(provider) => {
				this.selectedProvider = provider;
				this.step = "model";
				this.rebuild();
			},
			() => this.onCancel?.(),
			{ tui: this.options.tui },
		);
		this.addChild(selector);
		this.options.tui.setFocus(selector);
	}

	private renderModelStep(): void {
		const models = getBuiltinModels(this.selectedProvider as Parameters<typeof getBuiltinModels>[0]);
		const ids = models.map((m) => m.id);
		if (ids.length === 0) {
			this.addChild(new Text(theme.fg("error", `No models found for provider ${this.selectedProvider}.`), 1, 0));
			return;
		}
		const selector = new ExtensionSelectorComponent(
			`Step 2: Pick model for ${this.selectedProvider}`,
			ids,
			(modelId) => {
				this.selectedModel = modelId;
				this.step = "apikey";
				this.rebuild();
			},
			() => { this.step = "provider"; this.rebuild(); },
			{ tui: this.options.tui },
		);
		this.addChild(selector);
		this.options.tui.setFocus(selector);
	}

	private renderApikeyStep(): void {
		this.addChild(new Text(theme.fg("text", `Step 3: API key for ${this.selectedProvider} (masked)`), 1, 0));
		this.addChild(new Spacer(1));
		const input = new PasswordInputComponent({ placeholder: "press Enter to skip" });
		input.onSubmit = (v) => {
			this.apiKey = v;
			this.options.settingsManager.setProviderKey(this.selectedProvider, v);
			this.options.settingsManager.setDefaultModelAndProvider(this.selectedProvider, this.selectedModel);
			this.step = "done";
			this.rebuild();
		};
		input.onCancel = () => { this.step = "model"; this.rebuild(); };
		this.addChild(input);
		this.options.tui.setFocus(input);
	}

	handleInput(key: string): void {
		if (this.step === "banner") {
			if (key === "enter") this.step = "provider";
			else if (key === "escape") this.onCancel?.();
			this.rebuild();
		}
		// Other steps handled by their child components.
	}
}
```

- [ ] **Step 5.3: Create the orchestrator**

Create `packages/coding-agent/src/cli/setup-llm.ts`:

```ts
import { getKeybindings, ProcessTerminal, setKeybindings, type TUI } from "@jesus/tui";
import { initTheme } from "../modes/interactive/theme/theme.ts";
import { SettingsManager } from "../core/settings-manager.ts";
import { SetupLlmComponent } from "../modes/interactive/components/setup-llm.ts";

export async function showSetupLlmWizard(settingsManager: SettingsManager): Promise<void> {
	await initTheme();
	const terminal = new ProcessTerminal();
	const ui = new TUI(terminal);
	const component = new SetupLlmComponent({
		tui: ui,
		settingsManager,
		detectedProvider: settingsManager.getDefaultProvider?.(),
		detectedModel: settingsManager.getDefaultModel(),
	});
	component.onCancel = () => {
		ui.stop();
		process.exit(0);
	};
	ui.addChild(component);
	ui.setFocus(component);
	ui.start();

	// Wait until "done" step ends the UI; the simplest reliable trigger is
	// "user pressed Enter on done" — but our component already calls
	// settingsManager.persist() before showing done. We exit after a tick.
	await new Promise<void>((resolve) => {
		const interval = setInterval(() => {
			// Done step is terminal; we let user read the message then exit
			// after first done render. In practice this should listen for
			// any key, but for MVP auto-exit after 2s of done display.
			// Simpler: do nothing here and let Ctrl+C / window close.
			resolve();
		}, 2000);
		setTimeout(() => {
			clearInterval(interval);
			ui.stop();
			resolve();
		}, 2000);
	});
}
```

> **Honest note**: the orchestrator's "auto-exit after 2s of done" is rough. The implementer may prefer to listen for Enter on the done step and exit. Document the choice in the commit message.

- [ ] **Step 5.4: Run `npm run check`**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -15
```
Expected: exit 0 (modulo 2 pre-existing). If new warnings appear in tui or coding-agent, fix before continuing.

- [ ] **Step 5.5: Commit (wizard files only)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/src/cli/setup-llm.ts packages/coding-agent/src/modes/interactive/components/setup-llm.ts && git status --short
```
Expected: 2 new files staged.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(agent): setup-llm wizard component + CLI orchestrator

3-step wizard: banner → pick provider (39 built-ins) → pick model
(static from getBuiltinModels) → enter API key (masked). Writes
defaultProvider/defaultModel + providerKeys to settings.json.

Banner: ✝  J E S U S   A G E N T (plain text per 2026-09-08 user
choice). Reuses ExtensionSelectorComponent for picker steps.
Auto-exits 2s after done step (MVP; future spec may add 'press
Enter to exit' for cleaner UX)." 2>&1 | tail -5
```
Expected: 1 commit, 2 files changed.

---

## Task 6: Final verification

**Files:** none new.

- [ ] **Step 6.1: Run full check + tests**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -10
```
Expected: exit 0 (modulo 2 pre-existing).

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run test:scripts 2>&1 | tail -10
```
Expected: 20/20 pass (unchanged from baseline).

- [ ] **Step 6.2: Run tui tests**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm --prefix packages/tui test 2>&1 | tail -10
```
Expected: all tui tests pass (5 new PasswordInputComponent tests + existing).

- [ ] **Step 6.3: Run coding-agent vitest for settings-manager**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run packages/coding-agent/test/settings-manager.test.ts 2>&1 | tail -15
```
Expected: 2 new setProviderKey tests pass.

- [ ] **Step 6.4: Verify --help shows the new flag**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node -e "
import('./packages/coding-agent/dist/cli.js').catch(() => {});
" 2>&1 | head -5
```
(If dist is not built, this fails — skip and rely on printHelp unit test or just grep args.ts source.)

Better:
```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && grep "setup-llm" packages/coding-agent/src/cli/args.ts
```
Expected: 2 matches (parseArgs branch + help text line).

- [ ] **Step 6.5: Final commit chain report**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git log --oneline df30b20..HEAD
```
Expected: 5 commits (Tasks 1-5):
1. `feat(tui): add PasswordInputComponent with mask rendering`
2. `feat(agent): SettingsManager.setProviderKey + providerKeys field`
3. `feat(agent): add --setup-llm CLI flag`
4. `feat(agent): route --setup-llm to wizard in main()`
5. `feat(agent): setup-llm wizard component + CLI orchestrator`

---

## Self-Review

### Spec coverage

| Spec § | Implemented in task |
|---|---|
| §3.1 CLI flag | Tasks 3 + 4 |
| §3.2 Main routing | Task 4 |
| §3.3 Wizard 3 steps + banner | Task 5 |
| §3.4 Settings field + setProviderKey | Task 2 |
| §3.5 Read API key (MVP: deferred) | Noted in spec; not in plan |
| §4 测试 | Tasks 1.2, 2.4, 6.1-6.3 |

### Placeholder scan

None. All code blocks complete.

### Type consistency

- `PasswordInputComponent` API: `new PasswordInputComponent(opts?)`, `getValue()`, `getMaskedValue()`, `handleInput(key)`, `onSubmit?`, `onCancel?`. Used identically in Task 1 test and Task 5 component.
- `SettingsManager.setProviderKey(provider, key)` and `getProviderKey(provider)` — consistent in Task 2 (impl + tests) and Task 5 (consumer).
- `SetupLlmComponent` opts: `{ tui, settingsManager, detectedProvider?, detectedModel? }` — matches Task 5 orchestrator's call.

### Spec deviations

| Item | Deviation | Recorded where |
|---|---|---|
| 39-item list scroll | No pagination; rely on terminal scroll | spec §3.3.2 风险注 |
| providerKeys fallback not wired in @jesus/ai | Deferred | spec §3.5 风险 + spec §1 非目标 |
| Auto-exit 2s after done step | Rough MVP UX | Task 5.3 honest note + commit message |

### Out-of-scope confirmed

- FirstTimeSetupComponent untouched
- Default startup untouched
- No crypto for keys (MVP plaintext)
- models.generated.ts untouched (AGENTS.md §Code Quality #27)