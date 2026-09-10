import { useEffect, useMemo, useState } from "react";
import { DEFAULT_DARK_THEME, type ChatMessage, type SessionSummary } from "@shared/types";
import { Sidebar } from "./components/Sidebar";
import { Composer } from "./components/Composer";
import { MessageList } from "./components/MessageList";
import { StatusBar } from "./components/StatusBar";

declare global {
	interface Window {
		jesus: {
			backend: {
				status(): Promise<{ port: number | null }>;
				restart(): Promise<{ ok: boolean }>;
				onReady(cb: (e: { port: number }) => void): () => void;
				onExit(cb: (e: { code: number | null; signal: NodeJS.Signals | null }) => void): () => void;
			};
			window: {
				minimize(): Promise<void>;
				close(): Promise<void>;
			};
		};
	}
}

const SEED_SESSIONS: SessionSummary[] = [
	{
		id: "intro",
		title: "Getting started with Jesus Agent",
		createdAt: Date.now() - 86_400_000,
		updatedAt: Date.now() - 3_600_000,
		messageCount: 4,
	},
	{
		id: "cross-banner",
		title: "Splash banner redesign",
		createdAt: Date.now() - 7_200_000,
		updatedAt: Date.now() - 1_800_000,
		messageCount: 12,
	},
];

const SEED_MESSAGES: ChatMessage[] = [
	{
		id: "m1",
		role: "user",
		content: "What can you help with?",
		createdAt: Date.now() - 60_000,
	},
	{
		id: "m2",
		role: "assistant",
		content: "I'm the Jesus Agent GUI — wired up to the same coding-agent backend that powers the TUI. Try asking me to read or edit a file in this repo, or paste an error.",
		createdAt: Date.now() - 30_000,
		model: "MiniMax-M3",
	},
];

export function App(): JSX.Element {
	const theme = useMemo(() => DEFAULT_DARK_THEME, []);
	const [sessions] = useState<SessionSummary[]>(SEED_SESSIONS);
	const [activeSessionId, setActiveSessionId] = useState<string>(SEED_SESSIONS[0]?.id ?? "");
	const [messages, setMessages] = useState<ChatMessage[]>(SEED_MESSAGES);
	const [draft, setDraft] = useState<string>("");
	const [backendPort, setBackendPort] = useState<number | null>(null);

	useEffect(() => {
		if (!window.jesus) return;
		let unsubReady: (() => void) | undefined;
		let unsubExit: (() => void) | undefined;
		void window.jesus.backend.status().then((s) => setBackendPort(s.port));
		unsubReady = window.jesus.backend.onReady((e) => setBackendPort(e.port));
		unsubExit = window.jesus.backend.onExit(() => setBackendPort(null));
		return () => {
			unsubReady?.();
			unsubExit?.();
		};
	}, []);

	const handleSend = (): void => {
		const text = draft.trim();
		if (!text) return;
		const userMsg: ChatMessage = {
			id: `m${messages.length + 1}`,
			role: "user",
			content: text,
			createdAt: Date.now(),
		};
		setMessages((prev) => [...prev, userMsg]);
		setDraft("");
		// TODO: once the backend RPC bridge is wired up, dispatch
		// the message to the agent and stream assistant reply via
		// window.jesus.backend events.
	};

	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "240px 1fr",
				gridTemplateRows: "1fr 28px",
				height: "100vh",
				backgroundColor: theme.bg,
				color: theme.fg,
				fontFamily:
					"'Cascadia Code', 'JetBrains Mono', 'SF Mono', 'Consolas', monospace",
			}}
		>
			<aside style={{ borderRight: `1px solid ${theme.muted}`, backgroundColor: theme.bg }}>
				<Sidebar
					sessions={sessions}
					activeId={activeSessionId}
					onSelect={setActiveSessionId}
					theme={theme}
				/>
			</aside>
			<main style={{ display: "grid", gridTemplateRows: "1fr auto", minHeight: 0 }}>
				<MessageList messages={messages} theme={theme} />
				<Composer
					value={draft}
					onChange={setDraft}
					onSend={handleSend}
					theme={theme}
				/>
			</main>
			<StatusBar
				theme={theme}
				backendPort={backendPort}
				themeName="dark-blue-green-pink"
			/>
		</div>
	);
}
