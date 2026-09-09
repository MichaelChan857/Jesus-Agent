import type { Provider } from "@jesus/ai";
import type { SettingsManager } from "./settings-manager.ts";

/**
 * Wrap a provider so its apiKey.resolve() consults
 * settings.json providerKeys[providerId] as a fallback source for the API key.
 *
 * Resolution priority (highest → lowest), per 2026-09-08 user direction:
 *   1. credential.key (already-stored credential from the auth flow)
 *   2. providerKeys[providerId] (this file's contribution)
 *   3. provider's own env-var lookup (ANTHROPIC_API_KEY etc., unchanged)
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
	const originalApiKey = provider.auth!.apiKey!;
	return {
		...provider,
		auth: {
			...provider.auth,
			apiKey: {
				...originalApiKey,
				name: originalApiKey.name ?? "API key",
				resolve: async (args) => {
					const result = await originalResolve(args);
					if (result?.auth && "apiKey" in result.auth && result.auth.apiKey) {
						return result;
					}
					const stored = await settingsManager.getProviderKey(provider.id);
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