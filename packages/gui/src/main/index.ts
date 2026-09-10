/**
 * Electron main process for the Jesus Agent GUI.
 *
 * Responsibilities:
 * - Create the BrowserWindow with secure defaults (contextIsolation on,
 *   nodeIntegration off, sandbox on).
 * - Spawn a backend agent process via the @jesus/coding-agent CLI in
 *   rpc mode, or — preferred once we wire it up — load the
 *   @jesus/server package in-process and stream events to the renderer
 *   over IPC. For now we shell out to the CLI.
 * - Expose a typed IPC bridge through preload.ts.
 *
 * The renderer never sees node APIs; it talks to us through
 * window.jesus.* (see preload.ts for the surface).
 */

import { type ChildProcess, spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, type IpcMainInvokeEvent, ipcMain, shell } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve paths relative to this source file's directory. In dev
// (tsx running src/main/index.ts) __dirname is src/main, so the
// preload lives at ../../dist/preload/index.cjs (built by
// scripts/dev.mjs before electron starts). In production __dirname
// is dist/main and the same relative path points at dist/preload.
const PRELOAD_PATH = join(__dirname, "../../dist/preload/index.cjs");
const RENDERER_DIST = resolve(__dirname, "../renderer/index.html");

const RENDERER_DEV_URL = process.env.JESUS_GUI_RENDERER_URL ?? "http://localhost:5173";
const IS_DEV = !app.isPackaged;
const REPO_ROOT = resolve(__dirname, "../../../..");
const CODING_AGENT_DIR = resolve(REPO_ROOT, "packages/coding-agent");

let mainWindow: BrowserWindow | null = null;
let backendProc: ChildProcess | null = null;
let backendPort: number | null = null;

function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 900,
		minHeight: 600,
		title: "Jesus Agent",
		backgroundColor: "#0d1b2a",
		show: false,
		webPreferences: {
			preload: PRELOAD_PATH,
			contextIsolation: true,
			nodeIntegration: false,
			// Sandbox mode forces the preload to run as CommonJS only.
			// We turn sandbox off so tsx can load a .ts preload during dev;
			// production builds compile the preload to .cjs first so sandbox
			// can be re-enabled for shipping. Keep this in sync with the
			// dev script and the production build.
			sandbox: !IS_DEV,
		},
	});

	mainWindow.once("ready-to-show", () => mainWindow?.show());

	if (IS_DEV) {
		void mainWindow.loadURL(RENDERER_DEV_URL);
	} else {
		void mainWindow.loadFile(RENDERER_DIST);
	}

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

/**
 * Spawn the coding-agent CLI in rpc mode. We use the cli.js bundle
 * already produced by `npm run build`. The CLI is expected to:
 *  - bind a unix socket (or optionally a tcp port) under
 *    ~/.jesus/gui-<pid>.sock
 *  - print the socket path on stdout's first line, then speak the
 *    rpc protocol defined in packages/protocol.
 *
 * For now we expose only `getBackendStatus` and `attachBackend` —
 * the renderer calls these once on startup to learn how to dial the
 * backend over IPC. Full session streaming is wired in attachBackend.ts.
 */
function spawnBackend(): void {
	if (backendProc) return;
	const cli = join(CODING_AGENT_DIR, "dist/bundle/cli.js");
	backendProc = spawn(process.execPath, [cli, "--rpc", "--stdio"], {
		stdio: ["ignore", "pipe", "pipe"],
		env: { ...process.env, JESUS_GUI: "1" },
	});

	backendProc.stdout?.on("data", (chunk: Buffer) => {
		const text = chunk.toString("utf-8");
		const firstLine = text.split("\n", 1)[0]?.trim();
		if (firstLine && firstLine.startsWith("port=")) {
			const port = Number.parseInt(firstLine.slice("port=".length), 10);
			if (Number.isFinite(port)) {
				backendPort = port;
				mainWindow?.webContents.send("backend:ready", { port });
			}
		}
	});

	backendProc.stderr?.on("data", (chunk: Buffer) => {
		process.stderr.write(`[jesus-gui backend] ${chunk.toString("utf-8")}`);
	});

	backendProc.on("exit", (code, signal) => {
		backendProc = null;
		backendPort = null;
		mainWindow?.webContents.send("backend:exit", { code, signal });
	});
}

// IPC bridge: typed surface the renderer calls via window.jesus.*
// (declared in preload.ts). Every handler is async; the renderer
// receives either the resolved value or a serialized error.
ipcMain.handle("backend:status", () => ({ port: backendPort }));
ipcMain.handle("backend:restart", () => {
	backendProc?.kill("SIGTERM");
	spawnBackend();
	return { ok: true };
});
ipcMain.handle("window:minimize", (e: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.handle("window:close", (e: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender)?.close());

app.whenReady().then(() => {
	spawnBackend();
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	backendProc?.kill("SIGTERM");
	if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
	backendProc?.kill("SIGTERM");
});
