/**
 * Cross-process types shared between the Electron main process and
 * the React renderer. Imported by both via the @shared alias.
 *
 * Keep this file dependency-free; types only.
 */

export type Role = "user" | "assistant" | "system";

export interface ChatMessage {
	id: string;
	role: Role;
	content: string;
	createdAt: number;
	/** Optional model identifier when role === "assistant". */
	model?: string;
	/** True while the model is still streaming this message. */
	streaming?: boolean;
}

export interface ToolCall {
	id: string;
	name: string;
	args: unknown;
	result?: unknown;
	error?: string;
}

export interface SessionSummary {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	messageCount: number;
}

export interface AppTheme {
	mode: "dark" | "light";
	accent: string;
	success: string;
	warning: string;
	error: string;
	bg: string;
	fg: string;
	muted: string;
}

export const DEFAULT_DARK_THEME: AppTheme = {
	mode: "dark",
	accent: "#5fa8ff",
	success: "#4ade80",
	warning: "#fbbf24",
	error: "#ff6b6b",
	bg: "#0d1b2a",
	fg: "#d4e5ee",
	muted: "#5a7a8c",
};
