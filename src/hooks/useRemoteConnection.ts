"use client"

import { useConnection } from "../contexts/ConnectionProvider"

export const useRemoteConnection = () => {
	const { wsRef, status, platform, send, subscribe } = useConnection()

	const sendCombo = (msg: string[]) => {
		send({
			type: "combo",
			keys: msg,
		})
	}

	return { status, platform, send, sendCombo, wsRef, subscribe }
}
