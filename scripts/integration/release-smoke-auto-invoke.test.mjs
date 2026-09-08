import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSmoke } from "../release-smoke.mjs";

test("runSmoke auto-invoke: artifact dir exists → no auto-invoke, 3 SKIP cells", async () => {
	// outDir exists → auto-invoke short-circuits to the matrix path.
	// skipBun + skipRealProvider reduces runtimes to [node] and cmds to
	// the 3 binary/CLI cells. Each cell checks existsSync on
	// outDir/node/pi.js which does NOT exist in this isolated tmp dir
	// → each returns SKIP ("binary missing"). exitCode 0 because SKIP
	// is not a FAIL.
	const root = mkdtempSync(join(tmpdir(), "smoke-integ-"));
	try {
		const res = await runSmoke({
			outDir: root,
			skipBun: true,
			skipRealProvider: true,
		});
		assert.equal(res.exitCode, 0, `expected exitCode 0; cells: ${JSON.stringify(res.cells)}`);
		assert.ok(Array.isArray(res.cells));
		assert.equal(res.cells.length, 3);
		for (const c of res.cells) {
			assert.equal(c.status, "SKIP", `expected SKIP for ${c.command}; got ${c.status}`);
			assert.equal(c.reason, "binary missing");
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("runSmoke auto-invoke: outDir absent triggers hard fail with empty cells when local-release exits non-zero", async () => {
	// Construct an outDir that genuinely does not exist. runSmoke's
	// auto-invoke will spawn scripts/local-release.mjs --out <dir> --force.
	// In a clean checkout with passing npm run check, local-release.mjs
	// MAY succeed; in that case the test would observe exitCode 0 and
	// some cells. The contract we want to assert is: the function never
	// crashes, and either (a) local-release failed → exitCode 1 + empty
	// cells, or (b) local-release succeeded → matrix ran normally.
	const parent = mkdtempSync(join(tmpdir(), "smoke-fail-"));
	const outDir = join(parent, "absent");
	rmSync(parent, { recursive: true, force: true });
	assert.equal(existsSync(outDir), false, "precondition: outDir must not exist");

	const res = await runSmoke({
		outDir,
		skipBun: true,
		skipRealProvider: true,
	});
	assert.ok(res.exitCode === 0 || res.exitCode === 1, `exitCode must be 0 or 1; got ${res.exitCode}`);
	if (res.exitCode === 1) {
		// Hard-fail branch: local-release.mjs exited non-zero.
		assert.deepEqual(res.cells, [], "no cells run when local-release fails (spec §4.C.6)");
	}
});