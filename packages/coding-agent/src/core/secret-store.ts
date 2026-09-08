import { PlaintextSecretStore } from "./plaintext-secret-store.ts";

export interface SecretStore {
	/** Persist a secret under (provider, account) key. */
	set(provider: string, account: string, secret: string): Promise<void>;
	/** Retrieve a secret. Returns undefined if not found. */
	get(provider: string, account: string): Promise<string | undefined>;
	/** Remove a secret. */
	remove(provider: string, account: string): Promise<void>;
}

type KeytarModule = typeof import("keytar");

let cachedKeytar: KeytarModule | null = null;
let keytarLoadFailed = false;

/**
 * Best-effort dynamic import of keytar. On failure, log a warning and
 * return null so the caller can fall back to in-memory storage.
 */
async function tryLoadKeytar(): Promise<KeytarModule | null> {
	if (cachedKeytar) return cachedKeytar;
	if (keytarLoadFailed) return null;
	try {
		cachedKeytar = await import("keytar");
		return cachedKeytar;
	} catch (err) {
		keytarLoadFailed = true;
		console.warn(
			`[secret-store] keytar unavailable; falling back to in-memory storage. ` +
				`API keys will not persist across process restart. (${(err as Error).message})`,
		);
		return null;
	}
}

/**
 * Lazy SecretStore: prefers OS keyring (via keytar), falls back to
 * in-memory storage when keytar.load fails. The fallback is silently
 * usable within a single process; restart loses the keys.
 */
export class KeytarSecretStore implements SecretStore {
	private readonly fallback = new PlaintextSecretStore();
	private keytar: KeytarModule | null = null;
	private initPromise: Promise<void> | null = null;

	private async ensureKeytar(): Promise<KeytarModule | null> {
		if (this.keytar) return this.keytar;
		if (!this.initPromise) {
			this.initPromise = tryLoadKeytar().then((m) => {
				this.keytar = m;
			});
		}
		await this.initPromise;
		return this.keytar;
	}

	async set(provider: string, account: string, secret: string): Promise<void> {
		const k = await this.ensureKeytar();
		if (k) {
			await k.setPassword(provider, account, secret);
		} else {
			await this.fallback.set(provider, account, secret);
		}
	}

	async get(provider: string, account: string): Promise<string | undefined> {
		const k = await this.ensureKeytar();
		if (k) {
			const v = await k.getPassword(provider, account);
			if (v !== null) return v;
		}
		return this.fallback.get(provider, account);
	}

	async remove(provider: string, account: string): Promise<void> {
		const k = await this.ensureKeytar();
		if (k) {
			await k.deletePassword(provider, account);
		}
		await this.fallback.remove(provider, account);
	}
}

/** Factory for the default (lazy, keytar-preferred) SecretStore. */
export function createSecretStore(): SecretStore {
	return new KeytarSecretStore();
}
