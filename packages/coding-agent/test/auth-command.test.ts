import { describe, expect, test } from "vitest";
import {
	AuthCommandError,
	getAuthCommandName,
	getAuthCommandUsage,
	parseAuthCommand,
	parseAuthSetArgs,
	parseAuthUnsetArgs,
} from "../src/cli/auth-command.ts";

describe("parseAuthCommand", () => {
	test("returns undefined for non-auth commands", () => {
		expect(parseAuthCommand(["hello"])).toBeUndefined();
	});

	test("parses 'auth check' with --provider", () => {
		const command = parseAuthCommand(["auth", "check", "--provider", "openai"]);
		expect(command?.kind).toBe("check");
		expect(command?.args).toEqual(["--provider", "openai"]);
	});

	test("parses 'auth print-api-key'", () => {
		const command = parseAuthCommand(["auth", "print-api-key", "--provider", "openai"]);
		expect(command?.kind).toBe("api_key");
	});

	test("parses 'auth print-bearer-token' with --min-expiry", () => {
		const command = parseAuthCommand([
			"auth",
			"print-bearer-token",
			"--provider",
			"anthropic",
			"--min-expiry",
			"30m",
		]);
		expect(command?.kind).toBe("bearer_token");
		expect(command?.minExpiryMs).toBe(30 * 60_000);
	});

	test("parses 'auth set' with two positionals", () => {
		const command = parseAuthCommand(["auth", "set", "openai", "sk-abc"]);
		expect(command?.kind).toBe("set");
		expect(command?.args).toEqual(["openai", "sk-abc"]);
	});

	test("parses 'auth set' with a single positional (key will be missing)", () => {
		const command = parseAuthCommand(["auth", "set", "openai"]);
		expect(command?.kind).toBe("set");
		expect(command?.args).toEqual(["openai"]);
	});

	test("parses 'auth unset' with a single positional", () => {
		const command = parseAuthCommand(["auth", "unset", "openai"]);
		expect(command?.kind).toBe("unset");
		expect(command?.args).toEqual(["openai"]);
	});

	test("throws on unknown auth subcommand", () => {
		expect(() => parseAuthCommand(["auth", "frobnicate"])).toThrow(AuthCommandError);
	});
});

describe("parseAuthSetArgs", () => {
	test("returns provider + key from two positionals", () => {
		expect(parseAuthSetArgs(["openai", "sk-abc"])).toEqual({ provider: "openai", key: "sk-abc" });
	});

	test("trims whitespace on the provider", () => {
		expect(parseAuthSetArgs(["  openai  ", "sk-abc"])).toEqual({ provider: "openai", key: "sk-abc" });
	});

	test("throws when no args", () => {
		expect(() => parseAuthSetArgs([])).toThrow(/requires a provider name and an API key/i);
	});

	test("throws when only provider given", () => {
		expect(() => parseAuthSetArgs(["openai"])).toThrow(/requires an API key/i);
	});

	test("throws when too many args", () => {
		expect(() => parseAuthSetArgs(["openai", "sk", "extra"])).toThrow(/exactly two/i);
	});

	test("throws when provider is empty after trim", () => {
		expect(() => parseAuthSetArgs(["   ", "sk"])).toThrow(/non-empty provider/i);
	});
});

describe("parseAuthUnsetArgs", () => {
	test("returns provider from a single positional", () => {
		expect(parseAuthUnsetArgs(["openai"])).toEqual({ provider: "openai" });
	});

	test("trims whitespace", () => {
		expect(parseAuthUnsetArgs(["  openai  "])).toEqual({ provider: "openai" });
	});

	test("throws on empty args", () => {
		expect(() => parseAuthUnsetArgs([])).toThrow(/requires a provider name/i);
	});

	test("throws on too many args", () => {
		expect(() => parseAuthUnsetArgs(["openai", "extra"])).toThrow(/exactly one positional/i);
	});

	test("throws on empty provider", () => {
		expect(() => parseAuthUnsetArgs(["   "])).toThrow(/non-empty provider/i);
	});
});

describe("getAuthCommandName / getAuthCommandUsage", () => {
	test("returns the canonical name for each kind", () => {
		expect(getAuthCommandName("check")).toBe("auth check");
		expect(getAuthCommandName("api_key")).toBe("auth print-api-key");
		expect(getAuthCommandName("bearer_token")).toBe("auth print-bearer-token");
		expect(getAuthCommandName("set")).toBe("auth set");
		expect(getAuthCommandName("unset")).toBe("auth unset");
	});

	test("returns the usage string for each kind", () => {
		expect(getAuthCommandUsage("set")).toMatch(/auth set <provider> <key>/);
		expect(getAuthCommandUsage("unset")).toMatch(/auth unset <provider>/);
		expect(getAuthCommandUsage("check")).toMatch(/auth check/);
	});
});
