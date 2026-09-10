import type { AppTheme, SessionSummary } from "@shared/types";

export interface SidebarProps {
	sessions: SessionSummary[];
	activeId: string;
	onSelect(id: string): void;
	theme: AppTheme;
}

export function Sidebar(props: SidebarProps): JSX.Element {
	return (
		<div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
			<header
				style={{
					padding: "12px 14px",
					borderBottom: `1px solid ${props.theme.muted}40`,
					display: "flex",
					alignItems: "center",
					gap: 8,
				}}
			>
				<span style={{ color: props.theme.warning, fontSize: 18, fontWeight: "bold" }}>✝</span>
				<span style={{ color: props.theme.fg, fontWeight: "bold", letterSpacing: 0.5 }}>
					JESUS
				</span>
				<span style={{ color: props.theme.muted, fontSize: 11 }}>v1.0.4</span>
			</header>
			<nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
				{props.sessions.map((s) => {
					const isActive = s.id === props.activeId;
					return (
						<button
							key={s.id}
							onClick={() => props.onSelect(s.id)}
							style={{
								display: "block",
								width: "100%",
								padding: "10px 14px",
												backgroundColor: isActive ? `${props.theme.accent}25` : "transparent",
								border: "none",
								borderLeft: isActive ? `3px solid ${props.theme.accent}` : "3px solid transparent",
								color: isActive ? props.theme.fg : props.theme.muted,
								textAlign: "left",
								cursor: "pointer",
												fontFamily: "inherit",
								fontSize: 13,
							}}
						>
							<div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
								{s.title}
							</div>
							<div style={{ fontSize: 11, color: props.theme.muted, marginTop: 2 }}>
								{s.messageCount} msg
							</div>
						</button>
					);
				})}
			</nav>
			<footer
				style={{
					padding: "10px 14px",
					borderTop: `1px solid ${props.theme.muted}40`,
					color: props.theme.muted,
					fontSize: 11,
				}}
			>
				AI Bernoulli · GUI preview
			</footer>
		</div>
	);
}
