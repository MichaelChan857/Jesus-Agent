# ExtensionSelectorComponent Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make `ExtensionSelectorComponent` scrollable so `pi --setup-llm`'s 39-provider picker fits in 80x24 terminals.

**Architecture:** Add `scrollOffset` + `maxVisibleItems=12` + indicator Text fields. `updateList()` renders only the visible window. `handleInput()` extends with pageUp/pageDown branches that jump a full page. Auto-scroll-to-cursor on selectedIndex change.

**Tech Stack:** TypeScript erasable syntax, vitest.

**Working directory:** `C:\Users\Administrator\projects\jesus-agent-harness\` (Windows bash).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `packages/coding-agent/src/modes/interactive/components/extension-selector.ts` | modify | scroll state + indicator + page keys |
| `packages/coding-agent/test/extension-selector-scroll.test.ts` | create | 5 unit tests |

---

## Constraints (AGENTS.md)

- §Code Quality #22: top-level imports only.
- §Code Quality #23: erasable TypeScript.
- §Git #58: stage explicit paths.
- §Git #61: commit format `feat(tui): <msg>` (use `tui` for this — touches TUI-adjacent component, even though the file lives in coding-agent).
- §Git #65: never `git commit --no-verify` etc.

---

## Task 1: Modify ExtensionSelectorComponent

**Files:**
- Modify: `packages/coding-agent/src/modes/interactive/components/extension-selector.ts`

- [ ] **Step 1.1: Read full current file**

Already done in conversation context — full file at 113 lines. Verify no recent drift with `wc -l`.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && wc -l packages/coding-agent/src/modes/interactive/components/extension-selector.ts
```
Expected: 113.

- [ ] **Step 1.2: Add scroll fields + indicator field**

In the class declaration, after `private onToggleToolsExpanded: ...`, add:

```ts
	private scrollOffset = 0;
	private readonly maxVisibleItems = 12;
	private indicatorText: Text = new Text("", 1, 0);
```

- [ ] **Step 1.3: Add `visibleEnd` getter + `scrollToKeepSelectedVisible` private method**

Append after the field block (before `constructor`):

```ts
	private get visibleEnd(): number {
		return Math.min(this.scrollOffset + this.maxVisibleItems, this.options.length);
	}

	private scrollToKeepSelectedVisible(): void {
		if (this.selectedIndex < this.scrollOffset) {
			this.scrollOffset = this.selectedIndex;
		} else if (this.selectedIndex >= this.visibleEnd) {
			this.scrollOffset = this.selectedIndex - this.maxVisibleItems + 1;
			const maxOffset = Math.max(0, this.options.length - this.maxVisibleItems);
			if (this.scrollOffset > maxOffset) this.scrollOffset = maxOffset;
		}
	}
```

- [ ] **Step 1.4: Wire `indicatorText` into constructor**

In `constructor()`, after `this.addChild(this.titleText);` (line 49) and before `this.addChild(new Spacer(1));` (line 49):

```ts
		this.addChild(this.indicatorText);
```

- [ ] **Step 1.5: Rewrite `updateList()` to render only visible window**

Replace the existing `updateList()` method body (lines 80-89) with:

```ts
	private updateList(): void {
		this.listContainer.clear();
		for (let i = this.scrollOffset; i < this.visibleEnd; i++) {
			const isSelected = i === this.selectedIndex;
			const text = isSelected
				? theme.fg("accent", "→ ") + theme.fg("accent", this.options[i])
				: `  ${theme.fg("text", this.options[i])}`;
			this.listContainer.addChild(new Text(text, 1, 0));
		}
		const total = this.options.length;
		if (total === 0) {
			this.indicatorText.setText(theme.fg("muted", "no items"));
			return;
		}
		const start = this.scrollOffset + 1;
		const end = this.visibleEnd;
		const cursor = this.selectedIndex + 1;
		this.indicatorText.setText(
			theme.fg("muted", `showing ${start}-${end} of ${total} (cursor at ${cursor})`),
		);
	}
```

- [ ] **Step 1.6: Update `handleInput()` up/down to call scrollToKeepSelectedVisible**

In `handleInput()` (lines 91-107), update the up/down branches:

```ts
		} else if (kb.matches(keyData, "tui.select.up") || keyData === "k") {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.scrollToKeepSelectedVisible();
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.down") || keyData === "j") {
			this.selectedIndex = Math.min(this.options.length - 1, this.selectedIndex + 1);
			this.scrollToKeepSelectedVisible();
			this.updateList();
		} else if (keyData === "pageUp") {
			this.scrollOffset = Math.max(0, this.scrollOffset - this.maxVisibleItems);
			this.selectedIndex = Math.max(0, this.selectedIndex - this.maxVisibleItems);
			this.updateList();
		} else if (keyData === "pageDown") {
			const maxOffset = Math.max(0, this.options.length - this.maxVisibleItems);
			this.scrollOffset = Math.min(maxOffset, this.scrollOffset + this.maxVisibleItems);
			this.selectedIndex = Math.min(this.options.length - 1, this.selectedIndex + this.maxVisibleItems);
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n") {
```

Insert pageUp/pageDown blocks BEFORE the existing confirm branch.

- [ ] **Step 1.7: Run `npm run check`**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -10
```
Expected: 2 pre-existing warnings, no new.

- [ ] **Step 1.8: Commit (selector only)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/src/modes/interactive/components/extension-selector.ts && git status --short
```
Expected: exactly `M packages/coding-agent/src/modes/interactive/components/extension-selector.ts`.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "feat(tui): add scroll support to ExtensionSelectorComponent

39-item setup-llm provider picker overflows 80x24. Adds:
- maxVisibleItems=12 visible window
- scrollOffset auto-adjusts to keep selectedIndex in view
- PageUp/PageDown jump full pages
- muted indicator 'showing X-Y of N (cursor at Z)'

Public API unchanged (constructor + handleInput). Empty list shows
'no items' in indicator. next step adds 5 unit tests." 2>&1 | tail -5
```
Expected: 1 commit, 1 file modified.

---

## Task 2: 5 unit tests

**Files:**
- Create: `packages/coding-agent/test/extension-selector-scroll.test.ts`

- [ ] **Step 2.1: Write failing tests**

Create the test file:

```ts
import { describe, expect, it } from "vitest";
import { ExtensionSelectorComponent } from "../src/modes/interactive/components/extension-selector.ts";

describe("ExtensionSelectorComponent scroll", () => {
	function make(opts: string[]) {
		const c = new ExtensionSelectorComponent(
			"Pick",
			opts,
			(_s) => {},
			() => {},
		);
		// Expose internals via any-cast for testing.
		return c as unknown as {
			options: string[];
			selectedIndex: number;
			scrollOffset: number;
			indicatorText: { getText(): string };
			handleInput(key: string): void;
			listContainer: { children: unknown[] };
		};
	}

	it("small list (<12): no scroll, renders all, indicator is 1-N of N", () => {
		const c = make(["a", "b", "c"]);
		expect(c.scrollOffset).toBe(0);
		expect(c.listContainer.children.length).toBe(3);
		expect(c.indicatorText.getText()).toContain("showing 1-3 of 3");
	});

	it("selectedIndex at end triggers scroll", () => {
		const c = make(Array.from({ length: 39 }, (_, i) => `p${i}`));
		// Move to index 38 (last)
		for (let i = 0; i < 38; i++) c.handleInput("down");
		expect(c.selectedIndex).toBe(38);
		// After auto-scroll, selectedIndex must be in visible window [scrollOffset, scrollOffset+12)
		expect(c.selectedIndex).toBeGreaterThanOrEqual(c.scrollOffset);
		expect(c.selectedIndex).toBeLessThan(c.scrollOffset + 12);
		// Indicator reflects cursor
		expect(c.indicatorText.getText()).toMatch(/cursor at 39/);
	});

	it("PageDown jumps full page (selectedIndex +12, scrollOffset +12)", () => {
		const c = make(Array.from({ length: 39 }, (_, i) => `p${i}`));
		// Start: selectedIndex=0, scrollOffset=0
		c.handleInput("pageDown");
		expect(c.selectedIndex).toBe(12);
		expect(c.scrollOffset).toBe(12);
		// Indicator should now show items 13-24 (1-indexed)
		expect(c.indicatorText.getText()).toContain("showing 13-24 of 39");
	});

	it("PageUp at top stays at 0", () => {
		const c = make(Array.from({ length: 39 }, (_, i) => `p${i}`));
		c.handleInput("pageUp");
		expect(c.selectedIndex).toBe(0);
		expect(c.scrollOffset).toBe(0);
	});

	it("PageDown at end clamps to last index", () => {
		const c = make(Array.from({ length: 20 }, (_, i) => `p${i}`));
		// 10 pageDowns should NOT crash, should land at 19
		for (let i = 0; i < 10; i++) c.handleInput("pageDown");
		expect(c.selectedIndex).toBe(19);
		// scrollOffset clamped to maxOffset = 20 - 12 = 8
		expect(c.scrollOffset).toBe(8);
		expect(c.indicatorText.getText()).toContain("showing 9-20 of 20");
	});

	it("empty list: indicator shows 'no items', no crash", () => {
		const c = make([]);
		expect(c.listContainer.children.length).toBe(0);
		expect(c.indicatorText.getText()).toContain("no items");
		c.handleInput("down");  // must not crash
		c.handleInput("pageDown");  // must not crash
	});
});
```

**Note**: Test `indicatorText.getText()` exists because `Text` component stores text (verify it does — read first line of `Text` class). If not exposed, fall back to reading `indicatorText.children[0]` or skip that assertion.

- [ ] **Step 2.2: Run tests**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run packages/coding-agent/test/extension-selector-scroll.test.ts 2>&1 | tail -20
```
Expected: 6 tests pass.

If `indicatorText.getText()` is not a real method on Text class, adapt the test to inspect `indicatorText`'s internal state differently (or just rely on scrollOffset/selectedIndex assertions).

- [ ] **Step 2.3: Run `npm run check`**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run check 2>&1 | tail -5
```
Expected: still 2 pre-existing warnings.

- [ ] **Step 2.4: Commit (test file)**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git add packages/coding-agent/test/extension-selector-scroll.test.ts && git status --short
```
Expected: exactly `A packages/coding-agent/test/extension-selector-scroll.test.ts`.

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git -c user.name="Jesus Agent Harness" -c user.email="agent@jesus.local" commit -m "test(tui): 6 cases for ExtensionSelectorComponent scroll

- small list (no scroll, full render, indicator 1-N of N)
- selectedIndex at end auto-scrolls to keep in view
- PageDown jumps selectedIndex +12, scrollOffset +12
- PageUp at top stays at 0
- PageDown past end clamps (maxOffset = N - 12)
- empty list shows 'no items', down/pageDown do not crash" 2>&1 | tail -5
```
Expected: 1 commit, 1 file added.

---

## Task 3: Final verification

**Files:** none new.

- [ ] **Step 3.1: Run combined vitest**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run packages/coding-agent/test/extension-selector-scroll.test.ts packages/coding-agent/test/with-stored-keys-provider.test.ts 2>&1 | tail -10
```
Expected: 6 + 4 = 10 tests pass.

- [ ] **Step 3.2: Run `npm run test:scripts`**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && npm run test:scripts 2>&1 | tail -8
```
Expected: 20/20 PASS.

- [ ] **Step 3.3: Commit chain report**

```bash
cd "C:/Users/Administrator/projects/jesus-agent-harness" && git log --oneline 79b20c3..HEAD
```
Expected: 2 commits (Tasks 1, 2).

---

## Self-Review

### Spec coverage

| Spec § | Task |
|---|---|
| §3.1 fields | Task 1.2 |
| §3.2 updateList | Task 1.5 |
| §3.3 handleInput pageUp/Down | Task 1.6 |
| §3.4 scrollToKeepSelectedVisible | Task 1.3 + 1.6 |
| §3.5 constructor indicatorText | Task 1.4 |
| §4 tests | Task 2 |

### Placeholder scan

None.

### Type consistency

`scrollOffset`, `selectedIndex`, `maxVisibleItems`, `visibleEnd` consistent across selector edits and test introspection.

### Spec deviations

None — implementation follows spec exactly.