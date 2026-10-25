"use client"

import { useEffect, useRef } from "react"
import NoSleep from "nosleep.js"

export interface UseKeepAwakeOptions {
	onError?: (err: unknown) => void
}

/**
 * Hook to prevent display sleep across mobile and desktop browsers using NoSleep.js.
 * Handles mobile browser user-gesture requirements and clean teardown.
 */
export function useKeepAwake(
	enabled = true,
	options: UseKeepAwakeOptions = {},
): void {
	const noSleepRef = useRef<NoSleep | null>(null)
	const enabledRef = useRef(enabled)
	const onErrorRef = useRef(options.onError)

	useEffect(() => {
		enabledRef.current = enabled
		onErrorRef.current = options.onError
	}, [enabled, options.onError])

	useEffect(() => {
		if (typeof window === "undefined") {
			return
		}

		if (!noSleepRef.current) {
			noSleepRef.current = new NoSleep()
		}
		const noSleep = noSleepRef.current

		if (!enabled) {
			if (noSleep.isEnabled) {
				noSleep.disable()
			}
			return
		}

		let isActive = true
		let isEnabling = false

		const enableNoSleep = () => {
			if (!enabledRef.current || !isActive || noSleep.isEnabled || isEnabling) {
				return
			}
			isEnabling = true
			noSleep
				.enable()
				.then(() => {
					if (!isActive || !enabledRef.current) {
						if (noSleep.isEnabled) {
							noSleep.disable()
						}
					}
				})
				.catch((err: unknown) => {
					if (isActive) {
						onErrorRef.current?.(err)
					}
				})
				.finally(() => {
					isEnabling = false
				})
		}

		// Initial attempt (in case a user gesture is already active)
		enableNoSleep()

		// User gestures required by mobile browsers to unlock media playback
		const gestureOptions: AddEventListenerOptions = {
			capture: true,
			passive: true,
		}

		window.addEventListener("pointerdown", enableNoSleep, gestureOptions)
		window.addEventListener("touchstart", enableNoSleep, gestureOptions)

		// Re-enable if returning to tab from background
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible" && enabledRef.current) {
				enableNoSleep()
			}
		}
		document.addEventListener("visibilitychange", handleVisibilityChange)

		return () => {
			isActive = false
			window.removeEventListener("pointerdown", enableNoSleep, {
				capture: true,
			})
			window.removeEventListener("touchstart", enableNoSleep, {
				capture: true,
			})
			document.removeEventListener("visibilitychange", handleVisibilityChange)

			if (noSleep.isEnabled) {
				noSleep.disable()
			}
		}
	}, [enabled])
}
