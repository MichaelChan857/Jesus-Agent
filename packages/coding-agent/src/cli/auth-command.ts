import type { AuthResult } from "@jesus/ai";
import { APP_NAME } from "../config.ts";
import type { Args } from "./args.ts";

export type AuthCommandKind = "check" | "api_key" | "bearer_token" | "set" | "unset";

export interface AuthCommand {
	kind: AuthCommandKind;
	args: string[];
	json: boolean;
	credentials: boolean;
	noRefresh: boolean;
	minExpiryMs?: number;
}

export class AuthCommandError extends Error {}

const AUTH_COMMAND_USAGE: Record<AuthCommandKind, string> = {
	check: `${APP_NAME} auth check --provider <provider> [--json] [--credentials] [--no-refresh]`,
	api_key: `${APP_NAME} auth print-api-key --provider <provider> [--model <model>]`,
	bearer_token: `${APP_NAME} auth print-bearer-token --provider <provider> [--model <model>] [--min-expiry <duration>]`,
	set: `${APP_NAME} auth set <provider> <key>`,
	unset: `${APP_NAME} auth unset <provider>`,
};

export function getAuthCommandName(kind: AuthCommandKind): string {
	if (kind === "check") return "auth check";
	if (kind === "api_key") return "auth print-api-key";
	if (kind === "bearer_token") return "auth print-bearer-token";
	if (kind === "set") return "auth set";
	return "auth unset";
}

export function getAuthCommandUsage(kind: AuthCommandKind): string {
	return AUTH_COMMAND_USAGE[kind];
}

export function isAuthCommandHelp(args: string[]): boolean {
	return (
		args[0] === "auth" &&
		(args[1] === undefined || args[1] === "help" || args.includes("--help") || args.includes("-h"))
	);
}

export function printAuthCommandHelp(): void {
	console.log(`Usage:
  pi auth print-api-key [--provider <provider>] [--model <model>]
  pi auth print-bearer-token [--provider <provider>] [--model <model>] [--min-expiry <duration>]
  pi auth check [--provider <provider>] [--model <model>] [--json] [--credentials] [--no-refresh]
  pi auth set <provider> <key>
  pi auth unset <provider>

Auth commands require at least one of --provider or --model. Checks refresh expired OAuth credentials by default; --no-refresh prevents this. --credentials emits the credential, or includes it in JSON output.

'auth set' persists an API key for the given provider in auth.json (mode 0600). It refuses to overwrite an existing OAuth credential — run 'auth unset' first. The key is written as 'api_key' type and replaces any prior api_key entry for the same provider.

'auth unset' removes the stored credential for the given provider.`);
}

export function parseAuthCommand(args: string[]): AuthCommand | undefined {
	if (args[0] !== "auth") return undefined;

	let kind: AuthCommandKind | undefined;
	if (args[1] === "check") kind = "check";
	else if (args[1] === "print-api-key") kind = "api_key";
	else if (args[1] === "print-bearer-token") kind = "bearer_token";
	else if (args[1] === "set") kind = "set";
	else if (args[1] === "unset") kind = "unset";
	if (!kind) {
		throw new AuthCommandError(
			`Unknown auth command "${args[1] ?? ""}". Use "${APP_NAME} auth print-api-key", "${APP_NAME} auth print-bearer-token", "${APP_NAME} auth check", "${APP_NAME} auth set", or "${APP_NAME} auth unset".`,
		);
	}

	const commandArgs: string[] = [];
	let json = false;
	let credentials = false;
	let noRefresh = false;
	let minExpiryMs: number | undefined;
	for (let index = 2; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--min-expiry") {
			if (kind !== "bearer_token")
				throw new AuthCommandError("--min-expiry is only supported by print-bearer-token");
			const value = args[++index];
			const match = value ? /^(\d+)(ms|s|m|h)$/iu.exec(value) : undefined;
			if (!match) throw new AuthCommandError("--min-expiry must use a duration such as 30m or 1h");
			const amount = Number(match[1]);
			const unit = match[2];
			minExpiryMs = amount * (unit === "ms" ? 1 : unit === "s" ? 1_000 : unit === "m" ? 60_000 : 3_600_000);
			continue;
		}
		if (arg === "--json" || arg === "--credentials" || arg === "--no-refresh") {
			if (kind !== "check") throw new AuthCommandError(`${arg} is only supported by auth check`);
			if (arg === "--json") json = true;
			else if (arg === "--credentials") credentials = true;
			else noRefresh = true;
			continue;
		}
		commandArgs.push(arg);
	}

	return minExpiryMs === undefined
		? { kind, args: commandArgs, json, credentials, noRefresh }
		: { kind, args: commandArgs, json, credentials, noRefresh, minExpiryMs };
}

export function validateAuthCommandArgs(args: Args, kind: AuthCommandKind): { provider?: string; model?: string } {
	const provider = args.provider?.trim() || undefined;
	const model = args.model?.trim() || undefined;
	if (args.unknownFlags.size > 0) {
		const option = args.unknownFlags.keys().next().value;
		throw new AuthCommandError(`Unknown option --${option} for "${getAuthCommandName(kind)}".`);
	}
	if (args.apiKey !== undefined || args.messages.length > 0 || args.fileArgs.length > 0) {
		throw new AuthCommandError("Auth commands only accept --provider and --model");
	}
	if (kind === "check") {
		if (!provider && !model) {
			throw new AuthCommandError("Auth checks require --provider <provider> or --model <model>");
		}
		return { provider, model };
	}
	if (kind === "api_key" || kind === "bearer_token") {
		if (!provider && !model) {
			throw new AuthCommandError("Credential printing requires --provider <provider> or --model <model>");
		}
		return { provider, model };
	}
	// "set" and "unset" validate positionals elsewhere via parseAuthSetArgs.
	return { provider, model };
}

/**
 * Parse positional arguments for `auth set <provider> <key>` and `auth unset <provider>`.
 * Positionals are passed through `parseArgs` and end up in `args.messages` after the parser
 * strips them from flag handling (since these subcommands do not use --provider/--model flags).
 */
export function parseAuthSetArgs(commandArgs: readonly string[]): { provider: string; key?: string } {
	if (
		commandArgs.length === 1 &&
		(commandArgs[0] === "help" || commandArgs[0] === "--help" || commandArgs[0] === "-h")
	) {
		throw new AuthCommandError("");
	}
	if (commandArgs.length === 0) {
		throw new AuthCommandError(
			"auth set requires a provider name and an API key. Usage: jesus auth set <provider> <key>",
		);
	}
	const provider = commandArgs[0]?.trim() ?? "";
	if (!provider) {
		throw new AuthCommandError("auth set requires a non-empty provider name");
	}
	if (commandArgs.length === 1) {
		throw new AuthCommandError(
			`auth set requires an API key after the provider. Usage: jesus auth set ${provider} <key>`,
		);
	}
	if (commandArgs.length > 2) {
		throw new AuthCommandError(
			`auth set accepts exactly two positional arguments: <provider> <key>. Got ${commandArgs.length}.`,
		);
	}
	const key = commandArgs[1] ?? "";
	return { provider, key };
}

export function parseAuthUnsetArgs(commandArgs: readonly string[]): { provider: string } {
	if (commandArgs.length === 0) {
		throw new AuthCommandError("auth unset requires a provider name. Usage: jesus auth unset <provider>");
	}
	if (commandArgs.length > 1) {
		throw new AuthCommandError(
			`auth unset accepts exactly one positional argument: <provider>. Got ${commandArgs.length}.`,
		);
	}
	const provider = commandArgs[0]?.trim() ?? "";
	if (!provider) {
		throw new AuthCommandError("auth unset requires a non-empty provider name");
	}
	return { provider };
}

export function getAuthCredential(auth: AuthResult | undefined): string | undefined {
	if (auth?.auth.apiKey) return auth.auth.apiKey;
	const authorization = Object.entries(auth?.auth.headers ?? {}).find(
		([name]) => name.toLowerCase() === "authorization",
	)?.[1];
	return typeof authorization === "string" ? /^Bearer\s+(.+)$/iu.exec(authorization)?.[1] : undefined;
}
