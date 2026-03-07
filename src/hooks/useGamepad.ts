"use client"

import { useCallback, useRef } from "react"
import type { GamepadState } from "@/types"
import { useRemoteConnection } from "../hooks/useRemoteConnection"

const THROTTLE_MS = 16

export const useGamepad = () => {
	const { send } = useRemoteConnection()
	const lastSendTime = useRef(0)
	const previousState = useRef<GamepadState | null>(null)

	const sendGamepadState = useCallback(
		(state: GamepadState) => {
			const now = Date.now()
			if (now - lastSendTime.current < THROTTLE_MS) {
				return
			}

			if (previousState.current) {
				const prev = previousState.current
				const hasChanges =
					state.leftStick.x !== prev.leftStick.x ||
					state.leftStick.y !== prev.leftStick.y ||
					state.rightStick.x !== prev.rightStick.x ||
					state.rightStick.y !== prev.rightStick.y ||
					Object.keys(state.buttons).some(
						(key) =>
							state.buttons[key as keyof typeof state.buttons] !==
							prev.buttons[key as keyof typeof prev.buttons],
					)

				if (!hasChanges) {
					return
				}
			}

			lastSendTime.current = now
			previousState.current = JSON.parse(JSON.stringify(state))

			send({
				type: "gamepad",
				state: {
					leftStick: state.leftStick,
					rightStick: state.rightStick,
					buttons: state.buttons,
				},
			})
		},
		[send],
	)

	return { sendGamepadState }
}
