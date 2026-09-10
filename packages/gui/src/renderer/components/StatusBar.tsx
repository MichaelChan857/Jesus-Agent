import type { AppTheme } from "@shared/types";

export interface StatusBarProps {
	theme: AppTheme;
	backendPort: number | null;
	themeName: string;
}

export function StatusBar(props: StatusBarProps): JSX.Element {
	return (
		<footer
			style={{
				gridColumn: "1 / -1",
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
				padding: "0 12px",
				borderTop: `1px solid ${props.theme.muted}40`,
				backgroundColor: "#0a1521",
				color: props.theme.muted,
				fontSize: 11,
			}}
		>
			<span>
				backend:{" "}
				{props.backendPort === null ? (
					<span style={{ color: props.theme.warning }}>offline</span>
				) : (
					<span style={{ color: props.theme.success }}>port {props.backendPort}</span>
				)}
			</span>
			<span>theme: {props.themeName}</span>
			<span>JESUS-AIB-1.0.4-F0B415</span>
		</footer>
	);
}
