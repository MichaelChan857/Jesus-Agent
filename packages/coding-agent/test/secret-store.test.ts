import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaintextSecretStore } from "../src/core/plaintext-secret-store.ts";

describe("PlaintextSecretStore", () => {
	it("CRUD: set → get → remove", async () => {
		const s = new PlaintextSecretStore();
		expect(await s.get("anthropic", "providerKey")).toBeUndefined();
		await s.set("anthropic", "providerKey", "sk-test");
		expect(await s.get("anthropic", "providerKey")).toBe("sk-test");
		await s.remove("anthropic", "providerKey");
		expect(await s.get("anthropic", "providerKey")).toBeUndefined();
	});

	it("isolates per provider+account", async () => {
		const s = new PlaintextSecretStore();
		await s.set("anthropic", "providerKey", "sk-a");
		await s.set("openai", "providerKey", "sk-o");
		expect(await s.get("anthropic", "providerKey")).toBe("sk-a");
		expect(await s.get("openai", "providerKey")).toBe("sk-o");
	});

	it("remove is idempotent (no error on missing key)", async () => {
		const s = new PlaintextSecretStore();
		await s.remove("nope", "nope");
	});
});