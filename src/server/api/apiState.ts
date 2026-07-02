/**
 * Shared memory state and state operations for the HTTP signaling layer.
 */

import type { ServerResponse } from "node:http"
import { AsyncLocalStorage } from "node:async_hooks"
import { getActiveToken, generateToken, storeToken } from "../tokenStore"
import { HostRunner } from "../gstreamer/hostRunner"
import type { InputPeerConnection } from "./InputPeerConnection"
import logger from "../../utils/logger"

export type SessionState =
	| "pending"
	| "offering"
	| "answered"
	| "connected"
	| "closed"

export interface IceCandidate {
	candidate: string
	sdpMid: string | null
	sdpMLineIndex: number | null
}

export interface Session {
	id: string
	createdAt: number
	state: SessionState
	offer: string | null
	answer: string | null
	viewerIce: IceCandidate[]
	hostIce: IceCandidate[]
}

export type HostStatus = "stopped" | "starting" | "running" | "error"

export const reinStorage = new AsyncLocalStorage<boolean>()

export const sessions = new Map<string, Session>()
export const sseClients = new Map<string, Set<ServerResponse>>()
export const inputConnections = new Map<string, InputPeerConnection>()

export let hostStatus: HostStatus = "stopped"
export let runnerInstance: HostRunner | null = null
export let pendingConfigUpdates: Record<string, unknown> | null = null

export function setHostStatus(status: HostStatus): void {
	hostStatus = status
}

export function setRunnerInstance(runner: HostRunner | null): void {
	runnerInstance = runner
}

export function setPendingConfigUpdates(
	updates: Record<string, unknown> | null,
): void {
	pendingConfigUpdates = updates
}

export function pushEvent(
	sessionId: string,
	event: string,
	data: unknown,
): void {
	const clients = sseClients.get(sessionId)
	if (!clients || clients.size === 0) return

	const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
	for (const res of clients) {
		try {
			reinStorage.run(true, () => {
				res.write(payload)
			})
		} catch {
			clients.delete(res)
		}
	}
}

export function ensureHostRunnerActive(localBaseUrl: string): HostRunner {
	if (runnerInstance) return runnerInstance

	setHostStatus("starting")
	logger.info("Initializing GStreamer HostRunner")

	try {
		const localToken = getActiveToken() ?? generateToken()
		storeToken(localToken)

		const runner = new HostRunner(localBaseUrl, localToken)
		setRunnerInstance(runner)
		setHostStatus("running")
		logger.info("GStreamer HostRunner is running")
		return runner
	} catch (err) {
		setHostStatus("error")
		logger.error(`Critical error initializing HostRunner: ${String(err)}`)
		throw err
	}
}
