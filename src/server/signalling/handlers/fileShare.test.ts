import { EventEmitter } from "node:events"
import type { IncomingMessage, ServerResponse } from "node:http"
import { describe, expect, it } from "vitest"
import {
	handleFileBrowse,
	handleFileDelete,
	handleFileDownload,
} from "./fileShare.ts"

class FakeResponse extends EventEmitter {
	statusCode = 0
	body = ""

	writeHead(status: number): this {
		this.statusCode = status
		return this
	}

	end(body?: string): this {
		this.body = body ?? ""
		this.emit("finish")
		return this
	}
}

function makeMalformedRequest(): IncomingMessage {
	return Object.assign(new EventEmitter(), {
		url: "http://[",
		headers: { host: "[" },
		socket: { remoteAddress: "127.0.0.1" },
	}) as unknown as IncomingMessage
}

describe("file-share HTTP handlers", () => {
	it.each([
		["browse", handleFileBrowse],
		["download", handleFileDownload],
		["delete", handleFileDelete],
	])("returns 400 for malformed request URLs in %s", async (_name, handler) => {
		const response = new FakeResponse()

		await expect(
			Promise.resolve().then(() =>
				handler(makeMalformedRequest(), response as unknown as ServerResponse),
			),
		).resolves.toBeUndefined()

		expect(response.statusCode).toBe(400)
		expect(JSON.parse(response.body)).toEqual({
			error: "Invalid request URL",
		})
	})
})
