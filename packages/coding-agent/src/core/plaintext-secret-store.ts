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
