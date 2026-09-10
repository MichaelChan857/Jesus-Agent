/**
 * Preload script for the Jesus Agent GUI renderer.
 *
 * Runs in an isolated world with contextIsolation on; the only
 * way the renderer talks to node / electron is through this
 * bridge. We expose a small typed surface on window.jesus.
 */
import { contextBridge, ipcRenderer } from "electron";

export interface BackendReadyEvent {
	port: number;
}

export interface BackendExitEvent {
	code: number | null;
	signal: NodeJS.Signals | null;
}

const api = {
	backend: {
		status: () => ipcRenderer.invoke("backend:status") as Promise<{ port: number | null }>,
		restart: () => ipcRenderer.invoke("backend:restart") as Promise<{ ok: boolean }>,
		onReady: (cb: (e: BackendReadyEvent) => void) => {
			const listener = (_: unknown, e: BackendReadyEvent) => cb(e);
			ipcRenderer.on("backend:ready", listener);
			return () => ipcRenderer.off("backend:ready", listener);
		},
		onExit: (cb: (e: BackendExitEvent) => void) => {
			const listener = (_: unknown, e: BackendExitEvent) => cb(e);
			ipcRenderer.on("backend:exit", listener);
			return () => ipcRenderer.off("backend:exit", listener);
		},
	},
	window: {
		minimize: () => ipcRenderer.invoke("window:minimize") as Promise<void>,
		close: () => ipcRenderer.invoke("window:close") as Promise<void>,
	},
};

contextBridge.exposeInMainWorld("jesus", api);

export type JesusApi = typeof api;
