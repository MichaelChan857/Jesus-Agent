import assert from "node:assert";
import { describe, it } from "node:test";
import { PasswordInputComponent } from "../src/components/password-input.ts";

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
		c.onSubmit = (v) => {
			submitted = v;
		};
		c.handleInput("a");
		c.handleInput("b");
		c.handleInput("enter");
		assert.equal(submitted, "ab");
	});

	it("emits cancel on Escape", () => {
		const c = new PasswordInputComponent();
		let fired = false;
		c.onCancel = () => {
			fired = true;
		};
		c.handleInput("escape");
		assert.equal(fired, true);
	});

	it("exposes Focusable interface (focused property)", () => {
		const c = new PasswordInputComponent();
		assert.equal(c.focused, false);
		c.focused = true;
		assert.equal(c.focused, true);
	});
});
