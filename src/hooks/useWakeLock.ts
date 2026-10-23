"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export interface UseWakeLockOptions {
	enabled?: boolean
	onLock?: () => VoidFunction
	onRelease?: () => void
	onError?: (error: unknown) => void
}

export interface UseWakeLockReturn {
	isSupported: boolean
	isActive: boolean
	request: () => Promise<boolean>
	release: () => Promise<void>
}

/**
 * Hook to keep the screen awake using the standard W3C Screen Wake Lock API.
 * Automatically handles page visibility changes (re-acquiring when returning
 * to the foreground) and clean unmounting.
 */
export function useWakeLock(
	options: UseWakeLockOptions = {},
): UseWakeLockReturn {
	const { enabled = true, onLock, onRelease, onError } = options

	const isSupported =
		typeof navigator !== "undefined" &&
		"wakeLock" in navigator &&
		Boolean(navigator.wakeLock)

	const [isActive, setIsActive] = useState(false)
	const sentinelRef = useRef<WakeLockSentinel | null>(null)
	const isRequestingRef = useRef(false)

	const onLockRef = useRef(onLock)
	onLockRef.current = onLock

	const onReleaseRef = useRef(onRelease)
	onReleaseRef.current = onRelease

	const onErrorRef = useRef(onError)
	onErrorRef.current = onError

	const request = useCallback(async (): Promise<boolean> => {
		if (
			!isSupported ||
			typeof document === "undefined" ||
			document.visibilityState !== "visible" ||
			isRequestingRef.current
		) {
			return false
		}

		if (sentinelRef.current && !sentinelRef.current.released) {
			setIsActive(true)
			return true
		}

		isRequestingRef.current = true
		try {
			const sentinel = await navigator.wakeLock.request("screen")
			sentinelRef.current = sentinel
			setIsActive(true)
			onLockRef.current?.()

			sentinel.addEventListener("release", () => {
				// System or OS revoked lock (e.g. backgrounding or manual power off)
				if (sentinelRef.current === sentinel) {
					sentinelRef.current = null
					setIsActive(false)
					onReleaseRef.current?.()
				}
			})

			return true
		} catch (err) {
			sentinelRef.current = null
			setIsActive(false)
			onErrorRef.current?.(err)
			return false
		} finally {
			isRequestingRef.current = false
		}
	}, [isSupported])

	const release = useCallback(async (): Promise<void> => {
		if (sentinelRef.current) {
			try {
				await sentinelRef.current.release()
			} catch {
				// Release failure can happen if already released by the OS; safe to ignore
			} finally {
				sentinelRef.current = null
				setIsActive(false)
				onReleaseRef.current?.()
			}
		}
	}, [])

	useEffect(() => {
		if (!enabled) {
			void release()
			return
		}
		void request()
		// System automatically releases wake locks when user leaves the tab or locks device.
		// Re-acquire when returning to foreground.
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible" && enabled) {
				void request()
			}
		}

		document.addEventListener("visibilitychange", handleVisibilityChange)

		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange)
			void release()
		}
	}, [enabled, request, release])

	return {
		isSupported,
		isActive,
		request,
		release,
	}
}
