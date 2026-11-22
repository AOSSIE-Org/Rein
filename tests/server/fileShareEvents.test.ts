import { EventEmitter } from "node:events"
import fs from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { Readable } from "node:stream"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	handleFileDelete,
	handleFileEvents,
	handleFileUpload,
} from "@/server/signalling/handlers/fileShare.ts"

vi.mock("@/utils/configHelper.ts", () => ({
	getUploadDir: () => "/tmp/rein-test-uploads",
}))

vi.mock("@/utils/logger.ts", () => ({
	default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

function loopbackRequest(
	url: string,
	extra: Partial<IncomingMessage> = {},
): IncomingMessage {
	const req = new Readable({ read() {} }) as unknown as IncomingMessage
	Object.assign(req, {
		url,
		headers: { host: "localhost" },
		socket: { remoteAddress: "127.0.0.1" },
		...extra,
	})
	return req
}

function multipartUpload(name: string): IncomingMessage {
	const boundary = "X-BOUNDARY"
	const body = Buffer.from(
		`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--${boundary}--\r\n`,
	)
	const req = Readable.from([body]) as unknown as IncomingMessage
	Object.assign(req, {
		url: "/api/files/upload",
		headers: {
			host: "localhost",
			"content-type": `multipart/form-data; boundary=${boundary}`,
		},
		socket: { remoteAddress: "127.0.0.1" },
	})
	return req
}

class FakeResponse extends EventEmitter {
	statusCode = 0
	writes: string[] = []
	ended = false
	/** Make writes of `data:` events throw, like a socket that has gone away. */
	failDataWrites = false
	writeHead(status: number) {
		this.statusCode = status
		return this
	}
	write(chunk: string) {
		if (this.failDataWrites && String(chunk).startsWith("data: ")) {
			throw new Error("socket closed")
		}
		this.writes.push(String(chunk))
		return true
	}
	end(chunk?: string) {
		this.ended = true
		if (chunk) this.writes.push(String(chunk))
	}
	/** The JSON `data:` events written to the stream, in order. */
	events(): Array<Record<string, unknown>> {
		return this.writes
			.filter((w) => w.startsWith("data: "))
			.map((w) => JSON.parse(w.slice(6)))
	}
}

const asResponse = (r: FakeResponse) => r as unknown as ServerResponse

async function upload(name: string): Promise<string> {
	const res = new FakeResponse()
	await handleFileUpload(multipartUpload(name), asResponse(res), "phone")
	return JSON.parse(res.writes.join("")).fileId
}

function remove(fileId: string) {
	const res = new FakeResponse()
	handleFileDelete(
		loopbackRequest(`/api/files?fileId=${fileId}`),
		asResponse(res),
	)
}

describe("file share event stream", () => {
	const streams: FakeResponse[] = []

	function connect(): FakeResponse {
		const res = new FakeResponse()
		streams.push(res)
		handleFileEvents(loopbackRequest("/api/files/events"), asResponse(res))
		return res
	}

	beforeEach(() => {
		vi.useFakeTimers()
		vi.spyOn(fs.promises, "writeFile").mockResolvedValue(undefined)
	})

	afterEach(async () => {
		// Closing a stream stops its keep-alive timer.
		for (const res of streams.splice(0)) res.emit("close")
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("sends the current files as one snapshot when a client connects", async () => {
		const a = await upload("a.txt")
		const b = await upload("b.txt")

		const res = connect()
		const events = res.events()

		expect(events).toHaveLength(1)
		expect(events[0].type).toBe("snapshot")
		const ids = (events[0].files as Array<{ fileId: string }>).map(
			(f) => f.fileId,
		)
		expect(ids).toEqual(expect.arrayContaining([a, b]))
		expect(events[0].files).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					fileId: a,
					name: "a.txt",
					uploadedBy: "phone",
				}),
			]),
		)
	})

	it("leaves a deleted file out of the snapshot a reconnecting client gets", async () => {
		const gone = await upload("gone.txt")
		const kept = await upload("kept.txt")

		// Client A is connected and then drops off (Wi-Fi loss, sleep).
		const before = connect()
		before.emit("close")

		// While A is away, the file is deleted. A never sees file-deleted.
		remove(gone)

		// A reconnects.
		const events = connect().events()
		const ids = (events[0].files as Array<{ fileId: string }>).map(
			(f) => f.fileId,
		)
		expect(ids).toContain(kept)
		expect(ids).not.toContain(gone)
	})

	it("keeps sending later changes as separate events after the snapshot", async () => {
		const res = connect()
		const added = await upload("late.txt")
		remove(added)

		const types = res.events().map((e) => e.type)
		expect(types).toEqual(["snapshot", "incoming-file", "file-deleted"])
		expect(res.events()[1].fileId).toBe(added)
	})

	it("ends the stream when the snapshot cannot be written, so the client reconnects", async () => {
		await upload("x.txt")
		const res = new FakeResponse()
		res.failDataWrites = true
		streams.push(res)

		handleFileEvents(loopbackRequest("/api/files/events"), asResponse(res))
		expect(res.ended).toBe(true)

		// It was not left subscribed: a later upload is not written to it.
		res.failDataWrites = false
		await upload("y.txt")
		expect(res.events()).toEqual([])
	})
})
