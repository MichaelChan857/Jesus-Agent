import { Container } from "../tui.ts";
import { Text } from "./text.ts";

export interface PasswordInputOptions {
	placeholder?: string;
	maxLength?: number;
}

/**
 * PasswordInputComponent — single-line input that masks typed characters.
 *
 * Unlike Input, this component does not support Emacs-style kill/yank or
 * undo stacks. It is purpose-built for short secret entry where the
 * underlying value must never be rendered.
 */
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
		// Order matters: control keys first, then printable chars.
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
		if (key.length === 1) {
			if (this.options.maxLength && this.value.length >= this.options.maxLength) {
				return;
			}
			this.value += key;
			this.rebuild();
		}
	}

	private rebuild(): void {
		this.clear();
		const display = this.getMaskedValue() || this.options.placeholder || "";
		this.addChild(new Text(display, 1, 0));
	}
}
