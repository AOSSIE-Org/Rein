import { useCallback } from "react"
import type { InputMessage } from "../server/InputHandler"
import { useConnection } from "../contexts/ConnectionProvider"

export const useRemoteConnection = () => {
	const { status, platform, send: baseSend, wsRef } = useConnection()

	const send = useCallback(
		(msg: InputMessage) => {
			baseSend(msg)
		},
		[baseSend],
	)

	const sendCombo = useCallback(
		(msg: string[]) => {
			baseSend({
				type: "combo",
				keys: msg,
			})
		},
		[baseSend],
	)

	return { status, platform, send, sendCombo, wsRef }
}
