import type { AppTheme } from "@shared/types";

export interface ComposerProps {
	value: string;
	onChange(value: string): void;
	onSend(): void;
	theme: AppTheme;
}

export function Composer(props: ComposerProps): JSX.Element {
	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			props.onSend();
		}
	};

	return (
		<div
			style={{
				borderTop: `1px solid ${props.theme.muted}40`,
				padding: "12px 16px",
				backgroundColor: props.theme.bg,
			}}
		>
			<textarea
				value={props.value}
				onChange={(e) => props.onChange(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Ask Jesus Agent anything. Enter to send, Shift+Enter for newline."
				rows={3}
				style={{
					width: "100%",
					boxSizing: "border-box",
					padding: "10px 12px",
					border: `1px solid ${props.theme.muted}60`,
					borderRadius: 6,
					backgroundColor: "#0f2235",
					color: props.theme.fg,
					fontFamily: "inherit",
					fontSize: 13,
					resize: "vertical",
					outline: "none",
				}}
			/>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
				<span style={{ fontSize: 11, color: props.theme.muted }}>
					{props.value.length} chars · Shift+Enter for newline
				</span>
				<button
					type="button"
					onClick={props.onSend}
					disabled={!props.value.trim()}
					style={{
						padding: "6px 16px",
						border: "none",
						borderRadius: 4,
						backgroundColor: props.value.trim() ? props.theme.accent : props.theme.muted,
						color: props.theme.bg,
						fontFamily: "inherit",
						fontWeight: "bold",
						cursor: props.value.trim() ? "pointer" : "not-allowed",
						fontSize: 12,
					}}
				>
					Send
				</button>
			</div>
		</div>
	);
}
