import type { AppTheme, ChatMessage } from "@shared/types";

export interface MessageListProps {
	messages: ChatMessage[];
	theme: AppTheme;
}

export function MessageList(props: MessageListProps): JSX.Element {
	return (
		<div style={{ overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
			{props.messages.map((m) => {
				const isUser = m.role === "user";
				return (
					<div
						key={m.id}
						style={{
							display: "flex",
							justifyContent: isUser ? "flex-end" : "flex-start",
						}}
					>
						<div
							style={{
								maxWidth: "78%",
								padding: "10px 14px",
								borderRadius: 8,
								backgroundColor: isUser ? "#1a2f44" : "#0f2235",
								border: `1px solid ${isUser ? props.theme.accent + "60" : props.theme.muted + "40"}`,
								color: props.theme.fg,
								fontSize: 13,
								lineHeight: 1.5,
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
							}}
						>
							<div
								style={{
									fontSize: 11,
									color: props.theme.muted,
									marginBottom: 4,
									display: "flex",
									justifyContent: "space-between",
								}}
							>
								<span style={{ color: isUser ? props.theme.accent : props.theme.success }}>
									{isUser ? "you" : m.model ?? "assistant"}
								</span>
								<span>{new Date(m.createdAt).toLocaleTimeString()}</span>
							</div>
							{m.content}
						</div>
					</div>
				);
			})}
		</div>
	);
}
