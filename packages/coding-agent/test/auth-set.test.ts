import type { Provider } from "@jesus/ai";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AuthSetError, executeAuthSet, executeAuthUnset, normalizeApiKey } from "../src/cli/auth-set.ts";
import { AuthStorage } from "../src/core/auth-storage.ts";

const fakeProvider: Provider = {
	id: "openai",
	name: "OpenAI",
	models: [],
	api: "openai-completions",
	baseUrl: "https://api.openai.com/v1",
	auth: { apiKey: "OPENAI_API_KEY" },
};

describe("auth-set / auth-unset", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("executeAuthSet", () => {
		test("writes a new api_key credential and reports created=true", async () => {
			const storage = AuthStorage.inMemory();
			const result = await executeAuthSet({
				provider: fakeProvider,
				providerId: "openai",
				key: "sk-new-key-123",
				storage,
			});

			expect(result).toEqual({ providerId: "openai", created: true });
			expect(await storage.read("openai")).toEqual({ type: "api_key", key: "sk-new-key-123" });
		});

		test("overwrites an existing api_key credential and reports created=false", async () => {
			const storage = AuthStorage.inMemory({
				openai: { type: "api_key", key: "sk-old" },
			});

			const result = await executeAuthSet({
				provider: fakeProvider,
				providerId: "openai",
				key: "sk-new-key-456",
				storage,
			});

			expect(result.created).toBe(false);
			expect(await storage.read("openai")).toEqual({ type: "api_key", key: "sk-new-key-456" });
		});

		test("refuses to overwrite an existing oauth credential", async () => {
			const storage = AuthStorage.inMemory({
				anthropic: {
					type: "oauth",
					access: "access",
					refresh: "refresh",
					expires: Date.now() + 60_000,
				},
			});

			await expect(
				executeAuthSet({
					provider: { ...fakeProvider, id: "anthropic" },
					providerId: "anthropic",
					key: "sk-anything",
					storage,
				}),
			).rejects.toThrow(/OAuth/);

			const credential = await storage.read("anthropic");
			expect(credential?.type).toBe("oauth");
		});

		test("rejects an empty key", async () => {
			const storage = AuthStorage.inMemory();
			await expect(
				executeAuthSet({ provider: fakeProvider, providerId: "openai", key: "   ", storage }),
			).rejects.toBeInstanceOf(AuthSetError);
		});

		test("rejects a key with embedded newlines (unquoted shell argument)", async () => {
			const storage = AuthStorage.inMemory();
			await expect(
				executeAuthSet({
					provider: fakeProvider,
					providerId: "openai",
					key: "line1\nline2",
					storage,
				}),
			).rejects.toThrow(/newline/i);
		});

		test("rejects command-substitution-looking keys", async () => {
			const storage = AuthStorage.inMemory();
			await expect(
				executeAuthSet({
					provider: fakeProvider,
					providerId: "openai",
					key: "$(rm -rf /)",
					storage,
				}),
			).rejects.toThrow(/command/i);
		});

		test("trims surrounding whitespace from the key", async () => {
			const storage = AuthStorage.inMemory();
			await executeAuthSet({
				provider: fakeProvider,
				providerId: "openai",
				key: "  sk-trimmed-789  ",
				storage,
			});
			expect(await storage.read("openai")).toEqual({ type: "api_key", key: "sk-trimmed-789" });
		});
	});

	describe("executeAuthUnset", () => {
		test("removes an existing credential and reports removed=true", async () => {
			const storage = AuthStorage.inMemory({
				openai: { type: "api_key", key: "sk-existing" },
			});

			const result = await executeAuthUnset({ providerId: "openai", storage });
			expect(result).toEqual({ providerId: "openai", removed: true });
			expect(await storage.read("openai")).toBeUndefined();
		});

		test("reports removed=false when no credential exists", async () => {
			const storage = AuthStorage.inMemory();
			const result = await executeAuthUnset({ providerId: "openai", storage });
			expect(result).toEqual({ providerId: "openai", removed: false });
		});

		test("removes oauth credentials too", async () => {
			const storage = AuthStorage.inMemory({
				anthropic: {
					type: "oauth",
					access: "a",
					refresh: "r",
					expires: Date.now() + 1000,
				},
			});

			const result = await executeAuthUnset({ providerId: "anthropic", storage });
			expect(result.removed).toBe(true);
			expect(await storage.read("anthropic")).toBeUndefined();
		});
	});

	describe("normalizeApiKey", () => {
		test("strips whitespace", () => {
			expect(normalizeApiKey("  abc  ")).toBe("abc");
		});

		test("throws on empty after trim", () => {
			expect(() => normalizeApiKey("   ")).toThrow(AuthSetError);
		});

		test("throws on newline-bearing input", () => {
			expect(() => normalizeApiKey("a\nb")).toThrow(/newline/i);
		});

		test("throws on $(...) substitution", () => {
			expect(() => normalizeApiKey("$(echo hi)")).toThrow(/command/i);
		});

		test("throws on backtick substitution", () => {
			expect(() => normalizeApiKey("`echo hi`")).toThrow(/command/i);
		});
	});
});
