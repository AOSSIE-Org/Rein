"use client"
import { useConnection } from "../contexts/ConnectionProvider"

export const useRemoteConnection = () => {
	const { status, send } = useConnection()

	const sendCombo = (keys: string[]) => send({ type: "combo", keys })

	return { status, send, sendCombo }
}
