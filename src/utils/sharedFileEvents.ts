export interface SharedFileInfo {
	fileId: string
	name: string
	size: number
	mimeType: string
	uploadedAt: number
	uploadedBy: string
}

/** A file as sent in an `incoming-file` event or inside a `snapshot` event. */
export interface SharedFileEventPayload {
	fileId?: string
	name?: string
	size?: number
	mimeType?: string
	uploadedAt?: number
	uploadedBy?: string
}

export interface SharedFileEvent extends SharedFileEventPayload {
	type: string
	files?: SharedFileEventPayload[]
}

function toSharedFileInfo(
	msg: SharedFileEventPayload & { fileId: string },
): SharedFileInfo {
	return {
		fileId: msg.fileId,
		name: msg.name ?? "file",
		size: msg.size ?? 0,
		mimeType: msg.mimeType ?? "application/octet-stream",
		uploadedAt: msg.uploadedAt ?? Date.now(),
		uploadedBy: msg.uploadedBy ?? "unknown",
	}
}

/**
 * Apply one file-share SSE event to the client's list.
 *
 * A `snapshot` replaces the whole list, so a client that missed `file-deleted`
 * events while it was disconnected (Wi-Fi drop, sleep, server restart) is
 * brought back in sync when `EventSource` reconnects.
 */
export function applySharedFileEvent(
	prev: SharedFileInfo[],
	msg: SharedFileEvent,
): SharedFileInfo[] {
	if (msg.type === "snapshot" && Array.isArray(msg.files)) {
		return msg.files
			.filter((f): f is SharedFileEventPayload & { fileId: string } =>
				Boolean(f?.fileId),
			)
			.map(toSharedFileInfo)
	}
	if (msg.type === "incoming-file" && msg.fileId) {
		if (prev.some((f) => f.fileId === msg.fileId)) return prev
		return [toSharedFileInfo({ ...msg, fileId: msg.fileId }), ...prev]
	}
	if (msg.type === "file-deleted" && msg.fileId) {
		return prev.filter((f) => f.fileId !== msg.fileId)
	}
	return prev
}
