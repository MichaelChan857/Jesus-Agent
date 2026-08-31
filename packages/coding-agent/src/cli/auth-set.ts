/**
 * `auth set` and `auth unset` execution logic.
 *
 * Persists a provider API key into auth.json, or removes an existing credential.
 * Refuses to overwrite an existing OAuth credential to avoid clobbering
 * interactive login state — callers must run `auth unset` first.
 */

import type { Credential, Provider } from "@jesus/ai";
import { AuthStorage } from "../core/auth-storage.ts";

export interface AuthSetOptions {
	provider: Provider;
	providerId: string;
	key: string;
	storage?: AuthStorage;
}

export interface AuthSetResult {
	providerId: string;
	created: boolean;
}

export class AuthSetError extends Error {}

/** Strip CR/LF and surrounding whitespace; reject empty or command-substitution shapes. */
export function normalizeApiKey(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed.length === 0) {
		throw new AuthSetError("API key is empty. Pass a non-empty key as the second argument.");
	}
	if (/[\r\n]/.test(trimmed)) {
		throw new AuthSetError("API key contains a newline. Did you forget to quotes the argument?");
	}
	if (trimmed.startsWith("$(") || trimmed.startsWith("`")) {
		throw new AuthSetError("API key looks like a shell command substitution. Pass the key directly.");
	}
	return trimmed;
}

export async function executeAuthSet(options: AuthSetOptions): Promise<AuthSetResult> {
	const { providerId, key: rawKey, storage: providedStorage } = options;
	const key = normalizeApiKey(rawKey);
	const storage = providedStorage ?? AuthStorage.create();

	let existed = false;
	await storage.modify(providerId, async (current) => {
		if (current && current.type !== "api_key") {
			throw new AuthSetError(
				`Provider "${providerId}" is currently authenticated via OAuth. Run 'auth unset ${providerId}' first.`,
			);
		}
		existed = current !== undefined;
		return { type: "api_key", key };
	});

	return { providerId, created: !existed };
}

export interface AuthUnsetOptions {
	providerId: string;
	storage?: AuthStorage;
}

export interface AuthUnsetResult {
	providerId: string;
	removed: boolean;
}

export async function executeAuthUnset(options: AuthUnsetOptions): Promise<AuthUnsetResult> {
	const { providerId, storage: providedStorage } = options;
	const storage = providedStorage ?? AuthStorage.create();
	const existing = await storage.read(providerId);
	if (!existing) {
		return { providerId, removed: false };
	}
	await storage.delete(providerId);
	return { providerId, removed: true };
}

/** Returns true if the provider id maps to a known provider in the registry. */
export function isKnownProvider(
	registry: ReadonlyMap<string, Provider> | { getProvider(id: string): Provider | undefined },
	providerId: string,
): boolean {
	if (typeof (registry as { getProvider?: unknown }).getProvider === "function") {
		return Boolean((registry as { getProvider(id: string): Provider | undefined }).getProvider(providerId));
	}
	return (registry as ReadonlyMap<string, Provider>).has(providerId);
}

export type { Credential };
