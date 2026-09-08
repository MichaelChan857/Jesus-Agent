import { beforeEach, describe, expect, it } from "vitest";
import { ExtensionSelectorComponent } from "../src/modes/interactive/components/extension-selector.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

beforeEach(() => {
	initTheme("dark");
});

type Internals = {
	options: string[];
	selectedIndex: number;
	scrollOffset: number;
	handleInput(key: string): void;
	indicatorText: { text?: string };
	listContainer: { children: unknown[] };
};

function make(opts: string[]): ExtensionSelectorComponent & Internals {
	const c = new ExtensionSelectorComponent(
		"Pick",
		opts,
		() => {},
		() => {},
	);
	return c as unknown as ExtensionSelectorComponent & Internals;
}

describe("ExtensionSelectorComponent scroll", () => {
	it("small list (<12): no scroll, renders all, indicator is 1-N of N", () => {
		const c = make(["a", "b", "c"]);
		expect(c.scrollOffset).toBe(0);
		expect(c.listContainer.children.length).toBe(3);
		expect(c.indicatorText.text).toContain("showing 1-3 of 3");
	});

	it("selectedIndex at end triggers scroll", () => {
		const c = make(Array.from({ length: 39 }, (_, i) => `p${i}`));
		// Move to index 38 (last) using 'j' fallback (same branch as 'down')
		for (let i = 0; i < 38; i++) c.handleInput("j");
		expect(c.selectedIndex).toBe(38);
		// After auto-scroll, selectedIndex must be in visible window [scrollOffset, scrollOffset+12)
		expect(c.selectedIndex).toBeGreaterThanOrEqual(c.scrollOffset);
		expect(c.selectedIndex).toBeLessThan(c.scrollOffset + 12);
		// Indicator reflects cursor
		expect(c.indicatorText.text).toMatch(/cursor at 39/);
	});

	it("PageDown jumps full page (selectedIndex +12, scrollOffset +12)", () => {
		const c = make(Array.from({ length: 39 }, (_, i) => `p${i}`));
		c.handleInput("pageDown");
		expect(c.selectedIndex).toBe(12);
		expect(c.scrollOffset).toBe(12);
		expect(c.indicatorText.text).toContain("showing 13-24 of 39");
	});

	it("PageUp at top stays at 0", () => {
		const c = make(Array.from({ length: 39 }, (_, i) => `p${i}`));
		c.handleInput("pageUp");
		expect(c.selectedIndex).toBe(0);
		expect(c.scrollOffset).toBe(0);
	});

	it("PageDown at end clamps to last index", () => {
		const c = make(Array.from({ length: 20 }, (_, i) => `p${i}`));
		for (let i = 0; i < 10; i++) c.handleInput("pageDown");
		expect(c.selectedIndex).toBe(19);
		// scrollOffset clamped to maxOffset = 20 - 12 = 8
		expect(c.scrollOffset).toBe(8);
		expect(c.indicatorText.text).toContain("showing 9-20 of 20");
	});

	it("empty list: indicator shows 'no items', no crash on inputs", () => {
		const c = make([]);
		expect(c.listContainer.children.length).toBe(0);
		expect(c.indicatorText.text).toContain("no items");
		c.handleInput("down");
		c.handleInput("pageDown");
	});
});