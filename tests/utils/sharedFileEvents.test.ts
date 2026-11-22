import { describe, expect, it } from "vitest"
import {
	applySharedFileEvent,
	type SharedFileInfo,
} from "@/utils/sharedFileEvents"

const file = (fileId: string, name = `${fileId}.txt`): SharedFileInfo => ({
	fileId,
	name,
	size: 1,
	mimeType: "text/plain",
	uploadedAt: 1,
	uploadedBy: "phone",
})

describe("shared file events", () => {
	it("adds an incoming file once, newest first", () => {
		const list = [file("a")]
		const next = applySharedFileEvent(list, {
			type: "incoming-file",
			fileId: "b",
			name: "b.txt",
		})
		expect(next.map((f) => f.fileId)).toEqual(["b", "a"])
		expect(
			applySharedFileEvent(next, { type: "incoming-file", fileId: "b" }),
		).toBe(next)
	})

	it("removes a deleted file", () => {
		const next = applySharedFileEvent([file("a"), file("b")], {
			type: "file-deleted",
			fileId: "a",
		})
		expect(next.map((f) => f.fileId)).toEqual(["b"])
	})

	it("replaces the list with a snapshot, dropping files that are gone", () => {
		// The client still shows "stale", which the server deleted or lost in a
		// restart while the client was disconnected.
		const next = applySharedFileEvent([file("stale"), file("kept")], {
			type: "snapshot",
			files: [{ fileId: "kept", name: "kept.txt" }, { fileId: "new" }],
		})
		expect(next.map((f) => f.fileId)).toEqual(["kept", "new"])
	})

	it("empties the list for an empty snapshot", () => {
		expect(
			applySharedFileEvent([file("a")], { type: "snapshot", files: [] }),
		).toEqual([])
	})

	it("fills in defaults for a snapshot entry with missing fields", () => {
		const [info] = applySharedFileEvent([], {
			type: "snapshot",
			files: [{ fileId: "x" }],
		})
		expect(info).toMatchObject({
			fileId: "x",
			name: "file",
			size: 0,
			mimeType: "application/octet-stream",
			uploadedBy: "unknown",
		})
	})

	it("ignores a snapshot without a files array and unknown events", () => {
		const list = [file("a")]
		expect(applySharedFileEvent(list, { type: "snapshot" })).toBe(list)
		expect(applySharedFileEvent(list, { type: "other", fileId: "a" })).toBe(
			list,
		)
	})

	it("skips snapshot entries that have no fileId", () => {
		const next = applySharedFileEvent([], {
			type: "snapshot",
			files: [{ name: "no-id" }, { fileId: "ok" }],
		})
		expect(next.map((f) => f.fileId)).toEqual(["ok"])
	})
})
