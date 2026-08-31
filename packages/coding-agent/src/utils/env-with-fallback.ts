/**
 * Resolve an environment variable, preferring the Jesus Agent name while
 * preserving the legacy `PI_*` upstream name as a fallback for users who
 * migrated with existing shell configuration. The new name wins when both are
 * set.
 *
 * This helper is duplicated in `@jesus/ai` and the coding-agent packages
 * because the packages have no shared utility module; each copy is tiny and
 * evolves independently.
 */
export function getEnvWithFallback(jesusName: string, legacyName?: string): string | undefined {
	const primary = process.env[jesusName];
	if (primary !== undefined) return primary;
	if (legacyName) return process.env[legacyName];
	return undefined;
}

/** Truthy env flag (`1`/`true`/`yes`), respecting JESUS_* then PI_* legacy. */
export function getEnvFlagWithFallback(jesusName: string, legacyName?: string): boolean {
	const value = getEnvWithFallback(jesusName, legacyName);
	if (value === undefined) return false;
	return value === "1" || value === "true" || value === "yes";
}
