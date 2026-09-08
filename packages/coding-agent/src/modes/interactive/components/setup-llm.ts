import { type BuiltinProvider, getBuiltinModels, getBuiltinProviders } from "@jesus/ai/providers/all";
import { Container, getKeybindings, PasswordInputComponent, Spacer, Text, type TUI } from "@jesus/tui";
import type { SettingsManager } from "../../../core/settings-manager.ts";
import { theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { ExtensionSelectorComponent } from "./extension-selector.ts";
import { keyHint, rawKeyHint } from "./keybinding-hints.ts";

const SETUP_LLM_BANNER = [
	"=====================================",
	"          ✝  J E S U S   A G E N T",
	"        LLM Provider Setup Wizard",
	"=====================================",
];

export interface SetupLlmResult {
	provider: string;
	model: string;
	apiKey: string;
}

export interface SetupLlmOptions {
	tui: TUI;
	settingsManager: SettingsManager;
}

type Step = "banner" | "provider" | "model" | "apikey" | "done";

export class SetupLlmComponent extends Container {
	private step: Step = "banner";
	private selectedProvider = "";
	private selectedModel = "";
	private readonly options: SetupLlmOptions;
	public onCancel?: () => void;
	public onDone?: (result: SetupLlmResult) => void;

	constructor(options: SetupLlmOptions) {
		super();
		this.options = options;
		// Seed from current settings if present.
		this.selectedProvider = options.settingsManager.getDefaultProvider?.() ?? "";
		this.selectedModel = options.settingsManager.getDefaultModel() ?? "";
		this.rebuild();
	}

	private rebuild(): void {
		this.clear();

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		for (const line of SETUP_LLM_BANNER) {
			this.addChild(new Text(theme.fg("accent", theme.bold(line)), 1, 0));
		}
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(
				theme.fg("muted", "Pick a provider, then a model, then enter your API key. Re-run pi --setup-llm to redo."),
				1,
				0,
			),
		);
		this.addChild(new Spacer(1));

		if (this.step === "banner") {
			this.renderBannerStep();
		} else if (this.step === "provider") {
			this.renderProviderStep();
		} else if (this.step === "model") {
			this.renderModelStep();
		} else if (this.step === "apikey") {
			this.renderApikeyStep();
		} else if (this.step === "done") {
			this.renderDoneStep();
		}

		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
		this.options.tui.requestRender();
	}

	private renderBannerStep(): void {
		this.addChild(
			new Text(
				rawKeyHint("Enter") +
					" " +
					keyHint("tui.select.confirm", "continue") +
					"  " +
					keyHint("tui.select.cancel", "cancel"),
				1,
				0,
			),
		);
		this.options.tui.setFocus(this);
	}

	private renderProviderStep(): void {
		const providers = (getBuiltinProviders() as string[]).slice().sort();
		const selector = new ExtensionSelectorComponent(
			"Step 1 / 3: Pick your LLM provider",
			providers,
			(provider: string) => {
				this.selectedProvider = provider;
				this.step = "model";
				this.rebuild();
			},
			() => this.onCancel?.(),
			{ tui: this.options.tui },
		);
		this.clear();
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		for (const line of SETUP_LLM_BANNER) {
			this.addChild(new Text(theme.fg("accent", theme.bold(line)), 1, 0));
		}
		this.addChild(new Spacer(1));
		this.addChild(selector);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
		this.options.tui.requestRender();
		this.options.tui.setFocus(selector);
	}

	private renderModelStep(): void {
		const models = getBuiltinModels(this.selectedProvider as BuiltinProvider);
		const ids = models.map((m) => m.id);
		const selector = new ExtensionSelectorComponent(
			`Step 2 / 3: Pick model for ${this.selectedProvider} (${ids.length})`,
			ids,
			(modelId: string) => {
				this.selectedModel = modelId;
				this.step = "apikey";
				this.rebuild();
			},
			() => {
				this.step = "provider";
				this.rebuild();
			},
			{ tui: this.options.tui },
		);
		this.clear();
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		for (const line of SETUP_LLM_BANNER) {
			this.addChild(new Text(theme.fg("accent", theme.bold(line)), 1, 0));
		}
		this.addChild(new Spacer(1));
		this.addChild(selector);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
		this.options.tui.requestRender();
		this.options.tui.setFocus(selector);
	}

	private renderApikeyStep(): void {
		this.addChild(
			new Text(
				theme.fg("text", `Step 3 / 3: API key for ${this.selectedProvider} / ${this.selectedModel} (masked)`),
				1,
				0,
			),
		);
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(
				theme.fg(
					"muted",
					"Stored plaintext in settings.json. PI_<PROVIDER>_API_KEY env still wins; providerKeys fallback is a follow-up spec.",
				),
				1,
				0,
			),
		);
		this.addChild(new Spacer(1));
		const input = new PasswordInputComponent({ placeholder: "press Enter to skip" });
		input.onSubmit = (value: string) => {
			void this.options.settingsManager.setProviderKey(this.selectedProvider, value);
			this.options.settingsManager.setDefaultModelAndProvider(this.selectedProvider, this.selectedModel);
			void this.options.settingsManager.flush?.();
			this.step = "done";
			this.rebuild();
			this.onDone?.({
				provider: this.selectedProvider,
				model: this.selectedModel,
				apiKey: value,
			});
		};
		input.onCancel = () => {
			this.step = "model";
			this.rebuild();
		};
		this.addChild(input);
		this.options.tui.setFocus(input);
	}

	private renderDoneStep(): void {
		this.addChild(
			new Text(
				theme.fg(
					"accent",
					theme.bold(
						`Saved. Run \`pi\` to start, or \`pi --provider ${this.selectedProvider} --model ${this.selectedModel}\` to override.`,
					),
				),
				1,
				0,
			),
		);
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("muted", "Press Esc to exit, or Ctrl+C to quit."), 1, 0));
	}

	handleInput(key: string): void {
		const kb = getKeybindings();
		if (this.step === "banner") {
			if (kb.matches(key, "tui.select.confirm") || key === "enter") {
				this.step = "provider";
				this.rebuild();
			} else if (kb.matches(key, "tui.select.cancel") || key === "escape") {
				this.onCancel?.();
			}
		} else if (this.step === "done") {
			if (kb.matches(key, "tui.select.cancel") || key === "escape") {
				this.onCancel?.();
			}
		}
		// provider/model/apikey steps are handled by their child components
		// (ExtensionSelectorComponent and PasswordInputComponent); this
		// Container does not steal their input.
	}
}
