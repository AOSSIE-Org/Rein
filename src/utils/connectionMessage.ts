export type ConnectionMessage = {
	type?: string
	ax?: number
	ay?: number
}

export function getConnectionMessageType(msg: unknown): string | null {
	if (msg && typeof msg === "object" && "type" in msg) {
		return typeof (msg as { type?: unknown }).type === "string"
			? (msg as { type: string }).type
			: null
	}
	return null
}

export function isNeutralGamepadAxis(
	msg: unknown,
	type: string | null = getConnectionMessageType(msg),
): boolean {
	return (
		type === "gamepad-axis" &&
		typeof msg === "object" &&
		msg !== null &&
		(msg as ConnectionMessage).ax === 0 &&
		(msg as ConnectionMessage).ay === 0
	)
}

export function usesUnorderedChannel(msg: unknown): boolean {
	const type = getConnectionMessageType(msg)
	return (
		type === "move" ||
		type === "scroll" ||
		type === "touch" ||
		type === "zoom" ||
		(type === "gamepad-axis" && !isNeutralGamepadAxis(msg, type))
	)
}
