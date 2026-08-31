// one-shot rename: juses -> jesus (case-preserving) across the repo.
// Order matters — longest / most specific first to avoid clobbering.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const WRITE = args.includes("--write");

if (!DRY && !WRITE) {
	console.error("Pass --dry-run or --write");
	process.exit(2);
}

// Case-preserving pairs (longest first).
//  - "Juses Agent" first so the brand string converts before the bare "Juses" rule does.
const PAIRS = [
	["Juses Agent", "Jesus Agent"],
	["juses-agent", "jesus-agent"],
	["juses-org", "jesus-org"],
	["@juses/", "@jesus/"],
	["JUSES_", "JESUS_"],
	[".juses/", ".jesus/"],
	[".juses\\", ".jesus\\"],
	["~/.juses", "~/.jesus"],
	["/root/.juses", "/root/.jesus"],
	["/home/user/.juses", "/home/user/.jesus"],
	["Juses", "Jesus"],
	["juses", "jesus"],
];

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".cache"]);
const SKIP_FILES = new Set(["package-lock.json", "LICENSE", "scripts/rename-jesus.mjs"]);
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|mdx|yml|yaml|sh|ps1|bat|html|css)$/;

function isWhitelistedFile(rel) {
	// Historical changelog — never touch
	if (rel.endsWith(`${sep}CHANGELOG.md`)) return true;
	// pi-messages protocol — never touch
	if (rel.includes(`${sep}packages${sep}ai${sep}src${sep}api${sep}pi-messages`)) return true;
	return false;
}

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
			// never rewrite ourselves
			if (full === join(ROOT, "scripts", "rename-jesus.mjs")) continue;
			out.push(full);
		}
	}
	return out;
}

function apply(buf) {
	let out = buf;
	for (const [from, to] of PAIRS) {
		out = out.split(from).join(to);
	}
	return out;
}

let totalFiles = 0, totalHits = 0, changedFiles = 0;
for (const full of collect(ROOT)) {
	const rel = relative(ROOT, full);
	if (isWhitelistedFile(rel)) continue;

	const buf = readFileSync(full, "utf8");
	let hits = 0;
	for (const [from] of PAIRS) {
		const n = buf.split(from).length - 1;
		hits += n;
	}
	if (hits === 0) continue;

	totalFiles++;
	totalHits += hits;
	if (DRY) {
		console.log(`${rel}  (${hits} hits)`);
		continue;
	}
	if (WRITE) {
		const out = apply(buf);
		if (out !== buf) {
			writeFileSync(full, out, "utf8");
			changedFiles++;
		}
	}
}

console.log("");
console.log(`mode: ${DRY ? "dry-run" : WRITE ? "write" : "?"}`);
console.log(`files affected: ${totalFiles}`);
console.log(`total replacements: ${totalHits}`);
if (WRITE) console.log(`files written: ${changedFiles}`);