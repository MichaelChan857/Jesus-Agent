import { readFileSync } from "node:fs";
import { stripBom } from "../utils/text.ts";

/**
 * Extension/skills/packages manifest schema.
 *
 * Package authors add a top-level `"pi"` key to their package.json so that
 * jesus agent can discover their resources (extensions, skills, prompt
 * templates, themes). The `"pi"` key name is preserved for compatibility with
 * existing extensions published against the upstream schema; only the
 * TypeScript identifiers have been renamed in this fork.
 */
export interface AppManifest {
	extensions?: string[];
	skills?: string[];
	prompts?: string[];
	themes?: string[];
}

const RESOURCE_FIELDS = ["extensions", "skills", "prompts", "themes"] as const;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readAppManifest(packageJsonPath: string): AppManifest | null {
	try {
		const pkg: unknown = JSON.parse(stripBom(readFileSync(packageJsonPath, "utf-8")));
		if (!isObject(pkg) || !isObject(pkg.pi)) {
			return null;
		}

		const manifest: AppManifest = {};
		for (const field of RESOURCE_FIELDS) {
			const entries = pkg.pi[field];
			if (Array.isArray(entries) && entries.every((entry) => typeof entry === "string")) {
				manifest[field] = entries;
			}
		}
		return manifest;
	} catch {
		return null;
	}
}
