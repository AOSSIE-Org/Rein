"use client"

import { useConnection } from "../contexts/ConnectionProvider"

export const useRemoteConnection = () => {
	const { wsRef, status, platform, send, sendInput, subscribe } =
		useConnection()

	const sendCombo = (msg: string[]) => {
		send({
			type: "combo",
			keys: msg,
		})
	}

	return { status, platform, send: sendInput, sendCombo, wsRef, subscribe }
}
