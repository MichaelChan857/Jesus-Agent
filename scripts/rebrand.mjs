#!/usr/bin/env node
/**
 * one-shot brand-rebrander for pi -> jesus.
 *
 * Pi already provides a rebranding hook via `piConfig` in package.json
 * (covers: CLI banner, help text, config dir, ENV_CODING_AGENT_DIR,
 * debug-log filename). This script handles the remaining hard-coded
 * brand strings in source / docs / workflows / scripts:
 *
 *   1. npm package names     @earendil-works/pi-*     -> @jesus/*
 *   2. github repo URLs      earendil-works/pi        -> <OWNER>/jesus-agent
 *   3. github repo URLs      earendil-works/pi-mono   -> <OWNER>/jesus-agent
 *   4. docs URL              pi.dev                   -> jesus.dev
 *   5. landing text          "Pi Agent Harness"       -> "Jesus Agent Harness"
 *   6. cli binary name       in scripts / workflows   -> jesus
 *   7. config dir literal    .pi/                     -> .jesus/
 *   8. test launcher         pi-test.{sh,bat,ps1}     -> jesus-test.*
 *   9. self-identify env     process.env.PI_CODING_AGENT = "true"   -> JESUS_CODING_AGENT
 *  10. self-identify env     process.env.AI_AGENT = "pi"           -> "jesus"
 *
 *  WHITELIST (NEVER touched):
 *   - LICENSE   (MIT obligation)
 *   - all CHANGELOG.md (historical record)
 *   - package-lock.json (will be regenerated)
 *   - packages/ai/src/api/pi-messages*.{ts,lazy.ts}  (external SSE protocol)
 *   - any literal "pi-messages" / "PiMessages*" / "piMessages*" (protocol symbols)
 *   - JSON key "piConfig"  (rebranding mechanism itself)
 *   - any process.env.PI_* EXCEPT the two listed in #9/#10
 *     (PI_OFFLINE / PI_TELEMETRY / PI_CACHE_RETENTION / PI_IMAGE_PROTOCOL /
 *      PI_TRUE_COLOR / PI_HYPERLINKS / PI_TUI_* / PI_DEBUG_REDRAW /
 *      PI_HARDWARE_CURSOR / PI_CLEAR_ON_SHRINK / PI_TIMING / PI_SKIP_VERSION_CHECK /
 *      PI_INSTALLER_API_BASE / PI_MANAGED_INSTALL_ROOT / PI_PACKAGE_DIR /
 *      PI_NO_LOCAL_LLM / PI_GIST_TOKEN / PI_AUTH_JSON / PI_EVAL_ARTIFACT_DIR /
 *      PI_PROVIDER / PI_MODEL / PI_TUI_WIN32_TOOLCHAIN / PI_STARTUP_BENCHMARK /
 *      PI_EXPERIMENTAL / PI_TUI_WRITE_LOG / PI_TELEMETRY / PI_SHARE_VIEWER_URL /
 *      PI_ALLOW_LOCKFILE_CHANGE  are public config contracts and must keep working)
 *   - assets/binary files (.png, .jpg, .gif, .webp, .ico, .pdf, .wasm, .node, .woff*)
 *
 *  USAGE:
 *    node scripts/rebrand.mjs --dry-run     # list only, no writes
 *    node scripts/rebrand.mjs --write       # apply
 *    node scripts/rebrand.mjs --owner <gh>  # set repo owner (default: your-org)
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const WRITE = args.includes("--write");
const ownerIdx = args.indexOf("--owner");
const OWNER = ownerIdx >= 0 ? args[ownerIdx + 1] : "jesus-org";

if (!DRY && !WRITE) {
	console.error("Pass --dry-run or --write");
	process.exit(2);
}

// ---------- rules ----------
// Order matters: longest / most specific first to avoid clobbering.
// Per plan: minimal-scope rebrand — only the 5 core packages' npm scope
// is rewritten. Side packages (evals / chat / protocol / client /
// server / session-backends) keep their @earendil-works/pi-* names.
const RULES = [
	// --- 5 core packages' npm scope ---
	[/\@earendil-works\/pi-coding-agent/g, `@jesus/coding-agent`],
	[/\@earendil-works\/pi-agent-core/g, `@jesus/agent-core`],
	[/\@earendil-works\/pi-telemetry/g, `@jesus/telemetry`],
	[/\@earendil-works\/pi-tui/g, `@jesus/tui`],
	[/\@earendil-works\/pi-ai/g, `@jesus/ai`],
	// repo URLs
	[/earendil-works\/pi-mono/g, `${OWNER}/jesus-agent`],
	[/earendil-works\/pi\b/g, `${OWNER}/jesus-agent`],
	// docs site
	[/pi\.dev/g, `jesus.dev`],
	// landing text (preserve capitalization: Pi -> Jesus, pi -> jesus)
	[/Pi Agent Harness/g, `Jesus Agent Harness`],
	[/\bthe Pi agent\b/g, `the Jesus agent`],
	[/\bthe Pi coding agent\b/g, `the Jesus coding agent`],
	[/\bthe Pi CLI\b/g, `the Jesus CLI`],
	[/learn more about Pi\b/g, `learn more about Jesus`],
	// config dir literal — only when preceded by . or quote to avoid /api/pi-messages
	[/(["'`])\.pi\1/g, `$1.jesus$1`],
	// test launcher scripts
	[/\bpi-test\.sh\b/g, `jesus-test.sh`],
	[/\bpi-test\.bat\b/g, `jesus-test.bat`],
	[/\bpi-test\.ps1\b/g, `jesus-test.ps1`],
];

// Final-pass targeted rewrites (after the bulk pass) — applied only on
// the two specific source lines that hard-code self-identification.
const TARGETED = [
	[/process\.env\.PI_CODING_AGENT\s*=\s*"true"/g, `process.env.JESUS_CODING_AGENT = "true"`],
	[/process\.env\.AI_AGENT\s*=\s*"pi"/g, `process.env.AI_AGENT = "jesus"`],
];

// ---------- file collection ----------
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".cache"]);
const SKIP_FILES = new Set([
	"package-lock.json",
	"LICENSE",
	"scripts/rebrand.mjs",     // do not rewrite itself
]);

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|mdx|yml|yaml|sh|ps1|bat|html|css)$/;

function collect(dir, out = []) {
	for (const ent of readdirSync(dir)) {
		const full = join(dir, ent);
		const st = statSync(full);
		if (st.isDirectory()) {
			if (SKIP_DIRS.has(ent)) continue;
			collect(full, out);
		} else if (st.isFile()) {
			const base = ent;
			if (SKIP_FILES.has(base)) continue;
			if (!SOURCE_EXT.test(base)) continue;
			// never rewrite ourselves — our own source mentions the patterns we replace
			if (full === join(ROOT, "scripts", "rebrand.mjs")) continue;
			out.push(full);
		}
	}
	return out;
}

// ---------- whitelist for content ----------
function isWhitelistedFile(rel) {
	// external SSE protocol — never touch
	if (rel.includes(`${sep}packages${sep}ai${sep}src${sep}api${sep}pi-messages`)) return true;
	// historical changelog
	if (rel.endsWith(`${sep}CHANGELOG.md`)) return true;
	return false;
}

function applyRules(buf) {
	let out = buf;
	for (const [re, sub] of RULES) out = out.replace(re, sub);
	for (const [re, sub] of TARGETED) out = out.replace(re, sub);
	return out;
}

// ---------- main ----------
const allFiles = collect(ROOT);
let totalFiles = 0, totalHits = 0, changedFiles = 0;

for (const full of allFiles) {
	const rel = relative(ROOT, full);
	if (isWhitelistedFile(rel)) continue;

	const buf = readFileSync(full, "utf8");
	let hits = 0;
	for (const [re] of [...RULES, ...TARGETED]) {
		const m = buf.match(re);
		if (m) hits += m.length;
	}
	if (hits === 0) continue;

	totalFiles++;
	totalHits += hits;

	if (DRY) {
		console.log(`${rel}  (${hits} hits)`);
		continue;
	}

	if (WRITE) {
		const out = applyRules(buf);
		if (out !== buf) {
			writeFileSync(full, out, "utf8");
			changedFiles++;
		}
	}
}

console.log("");
console.log(`mode: ${DRY ? "dry-run" : WRITE ? "write" : "?"}`);
console.log(`owner: ${OWNER}`);
console.log(`files affected: ${totalFiles}`);
console.log(`total replacements: ${totalHits}`);
if (WRITE) console.log(`files written: ${changedFiles}`);
