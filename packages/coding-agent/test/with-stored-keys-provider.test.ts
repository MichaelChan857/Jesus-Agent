import { describe, expect, it, vi } from "vitest";
import type { SettingsManager } from "../src/core/settings-manager.ts";
import { withStoredKeys } from "../src/core/with-stored-keys-provider.ts";

// Minimal Provider stub — only the fields withStoredKeys touches.
type StubProvider = {
	id: string;
	name: string;
	auth?: {
		apiKey?: {
			resolve?: (input: unknown) => Promise<unknown>;
		};
	};
};

function makeProvider(id: string, originalResolve: (input: unknown) => Promise<unknown>): StubProvider {
	return { id, name: id, auth: { apiKey: { resolve: originalResolve } } };
}

function makeSettings(
	getProviderKey: (id: string) => Promise<string | undefined> | string | undefined,
): SettingsManager {
	return { getProviderKey } as unknown as SettingsManager;
}

describe("withStoredKeys", () => {
	it("returns original result when credential provides apiKey", async () => {
		const originalResolve = vi.fn(async () => ({ auth: { apiKey: "cred-key" }, source: "stored credential" }));
		const settingsGet = vi.fn(() => "stored-key");
		const provider = makeProvider("anthropic", originalResolve);
		const wrapped = withStoredKeys(provider as never, makeSettings(settingsGet));
		const resolve = wrapped.auth!.apiKey!.resolve!;
		const result = (await resolve({} as never)) as { auth: { apiKey: string }; source: string };
		expect(result).toEqual({ auth: { apiKey: "cred-key" }, source: "stored credential" });
		expect(settingsGet).not.toHaveBeenCalled();
	});

	it("returns providerKeys when credential absent and stored key present", async () => {
		const originalResolve = vi.fn(async () => undefined);
		const settingsGet = vi.fn(() => "stored-anthropic-key");
		const provider = makeProvider("anthropic", originalResolve);
		const wrapped = withStoredKeys(provider as never, makeSettings(settingsGet));
		const resolve = wrapped.auth!.apiKey!.resolve!;
		const result = (await resolve({} as never)) as { auth: { apiKey: string }; source: string };
		expect(result).toEqual({ auth: { apiKey: "stored-anthropic-key" }, source: "providerKeys[anthropic]" });
		expect(settingsGet).toHaveBeenCalledWith("anthropic");
	});

	it("falls through to env when neither credential nor stored key present", async () => {
		const originalResolve = vi.fn(async () => ({ auth: { apiKey: "env-key" }, source: "ANTHROPIC_API_KEY" }));
		const settingsGet = vi.fn(() => undefined);
		const provider = makeProvider("anthropic", originalResolve);
		const wrapped = withStoredKeys(provider as never, makeSettings(settingsGet));
		const resolve = wrapped.auth!.apiKey!.resolve!;
		const result = (await resolve({} as never)) as { auth: { apiKey: string }; source: string };
		expect(result).toEqual({ auth: { apiKey: "env-key" }, source: "ANTHROPIC_API_KEY" });
	});

	it("passes through when provider has no apiKey.resolve", () => {
		const provider = { id: "oauth-only", name: "oauth-only" };
		const settingsGet = vi.fn(() => "should-not-be-used");
		const wrapped = withStoredKeys(provider as never, makeSettings(settingsGet));
		expect(wrapped).toBe(provider);
	});
});
