import { ProcessTerminal, TuiMainScreen } from "@jesus/tui";
import type { SettingsManager } from "../core/settings-manager.ts";
import { SetupLlmComponent } from "../modes/interactive/components/setup-llm.ts";
import { initTheme } from "../modes/interactive/theme/theme.ts";

/**
 * Run the interactive setup-llm wizard and persist the user's choices
 * (provider + model + API key) to ~/.jesus/agent/settings.json.
 *
 * Exits the process on completion (Ctrl+C / Esc) or after the user
 * completes the 3-step wizard.
 */
export async function showSetupLlmWizard(settingsManager: SettingsManager): Promise<void> {
	await initTheme();
	const terminal = new ProcessTerminal();
	const ui = new TuiMainScreen(terminal, settingsManager.getShowHardwareCursor?.() ?? true);
	const component = new SetupLlmComponent({
		tui: ui,
		settingsManager,
	});

	let exited = false;
	const finish = (): void => {
		if (exited) return;
		exited = true;
		ui.stop();
		process.exit(0);
	};

	component.onCancel = () => finish();
	component.onDone = () => {
		// Give the user a moment to read the "Saved" message, then exit.
		setTimeout(finish, 1500);
	};

	ui.addChild(component);
	ui.setFocus(component);
	ui.start();
}
