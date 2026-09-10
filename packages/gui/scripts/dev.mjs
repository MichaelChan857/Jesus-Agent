#!/usr/bin/env node
/**
 * Dev runner for the GUI.
 *
 * 1. Build the preload (CommonJS) once. Sandbox mode requires CJS preload
 *    so we compile it from src/preload/index.ts → dist/preload/index.cjs.
 * 2. Start vite dev server (renderer hot reload on :5173).
 * 3. Spawn electron with tsx running src/main/index.ts (ESM main process).
 * 4. Forward SIGINT to both child processes.
 */
import { spawn } from "node:child_process";
import net from "node:net";

const RENDERER_PORT = 5173;
const RENDERER_URL = `http://localhost:${RENDERER_PORT}`;

function isPortOpen(port) {
	return new Promise((resolve) => {
		const socket = net.connect({ port, host: "127.0.0.1" });
		socket.once("connect", () => {
			socket.destroy();
			resolve(true);
		});
		socket.once("error", () => resolve(false));
	});
}

async function waitForPort(port, timeoutMs = 20000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await isPortOpen(port)) return;
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(`Port ${port} did not open within ${timeoutMs}ms`);
}

const children = [];

function spawnChild(name, cmd, args, env) {
	const child = spawn(cmd, args, {
		stdio: "inherit",
		env: { ...process.env, ...env },
		shell: process.platform === "win32",
	});
	child.on("exit", (code, signal) => {
		console.log(`[${name}] exited code=${code} signal=${signal}`);
		process.exit(code ?? 1);
	});
	children.push({ name, child });
	return child;
}

function runChildOnce(name, cmd, args, env) {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {
			stdio: "inherit",
			env: { ...process.env, ...env },
			shell: process.platform === "win32",
		});
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${name} failed with code ${code}`));
		});
	});
}

async function main() {
	console.log("[dev] building preload (CommonJS)...");
	await runChildOnce("tsc-preload", "npx", [
		"tsc",
		"-p",
		"tsconfig.preload.json",
		"--outDir",
		"dist/preload",
	]);
	console.log("[dev] preload built at dist/preload/index.cjs");

	console.log("[dev] starting vite renderer...");
	const renderer = spawnChild(
		"renderer",
		"npx",
		["vite", "--port", String(RENDERER_PORT), "--strictPort"],
		{},
	);
	await waitForPort(RENDERER_PORT);
	console.log(`[dev] renderer up at ${RENDERER_URL}`);

	console.log("[dev] launching electron via tsx...");
	spawnChild("electron-main", "npx", ["tsx", "src/main/index.ts"], {
		JESUS_GUI_RENDERER_URL: RENDERER_URL,
	});

	const shutdown = (sig) => {
		console.log(`[dev] ${sig} received, shutting down`);
		for (const { child } of children) {
			try {
				child.kill();
			} catch {
				/* ignore */
			}
		}
	};
	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
	console.error("[dev] fatal:", err);
	process.exit(1);
});
