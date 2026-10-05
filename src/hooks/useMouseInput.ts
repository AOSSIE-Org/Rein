import { useCallback, useEffect, useRef, useState } from "react"
import { getLocalStorageItem } from "@/utils/safeLocalStorage"

/**
 * DOM key names mapped to Rein internal key names.
 */
const DOM_KEY_MAP: Record<string, string> = {
	" ": "space",
	Space: "space",
	Escape: "escape",
	Esc: "escape",
	Control: "ctrl",
	Alt: "alt",
	Shift: "shift",
	Meta: "meta",
	ArrowUp: "arrowup",
	ArrowDown: "arrowdown",
	ArrowLeft: "arrowleft",
	ArrowRight: "arrowright",
	Backspace: "backspace",
	Tab: "tab",
	Enter: "enter",
	Delete: "delete",
	Home: "home",
	End: "end",
	PageUp: "pageup",
	PageDown: "pagedown",
	Insert: "insert",
}

const normalizeDOMKey = (k: string): string => DOM_KEY_MAP[k] ?? k.toLowerCase()

/**
 * Converts a client-relative click point to normalised [0, 1] screen ratios
 * using the #screenMirror video element's rendered rect and intrinsic resolution.
 * Correctly accounts for object-fit: contain letterboxing/pillarboxing.
 * Returns null when the video is unavailable or has no rendered size.
 */
function toNormalisedRatio(
	clientX: number,
	clientY: number,
): { x: number; y: number } | null {
	const video = document.getElementById(
		"screenMirror",
	) as HTMLVideoElement | null
	if (!video) return null
	const rect = video.getBoundingClientRect()
	if (rect.width === 0 || rect.height === 0) return null

	const intrinsicW = video.videoWidth || rect.width
	const intrinsicH = video.videoHeight || rect.height
	const intrinsicAspect = intrinsicW / intrinsicH
	const renderedAspect = rect.width / rect.height

	let contentW: number
	let contentH: number
	if (intrinsicAspect > renderedAspect) {
		// Letterboxed top/bottom
		contentW = rect.width
		contentH = rect.width / intrinsicAspect
	} else {
		// Pillarboxed left/right
		contentH = rect.height
		contentW = rect.height * intrinsicAspect
	}
	const offsetX = rect.left + (rect.width - contentW) / 2
	const offsetY = rect.top + (rect.height - contentH) / 2

	const x = Math.max(0, Math.min(1, (clientX - offsetX) / contentW))
	const y = Math.max(0, Math.min(1, (clientY - offsetY) / contentH))
	return { x, y }
}

/**
 * Hook for capturing direct physical mouse movement, mouse clicks, wheel scrolling,
 * pointer lock management, and physical keyboard input on the screen mirror.
 *
 * Touch interactions (mobile gestures, tap-to-drag, two-finger scroll) are strictly
 * excluded so pointer lock is requested ONLY for physical mouse inputs.
 */
export const useMouseInput = (send: (msg: unknown) => void, enabled = true) => {
	const containerRef = useRef<HTMLDivElement | null>(null)
	const [isLocked, setIsLocked] = useState(false)
	const [showLockHint, setShowLockHint] = useState(false)
	const lockHintTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const [mouseMode, setMouseMode] = useState<boolean>(
		() => getLocalStorageItem("rein_mouse_mode") === "true",
	)

	// Sync mouseMode when changed in Settings (same origin)
	useEffect(() => {
		const onStorage = (e: StorageEvent) => {
			if (e.key === "rein_mouse_mode") {
				setMouseMode(e.newValue === "true")
			}
		}
		window.addEventListener("storage", onStorage)
		return () => window.removeEventListener("storage", onStorage)
	}, [])

	const requestLock = useCallback(
		(e?: React.PointerEvent | PointerEvent | React.MouseEvent | MouseEvent) => {
			if (!enabled) return
			if (
				e &&
				"pointerType" in e &&
				e.pointerType &&
				e.pointerType !== "mouse"
			) {
				return
			}

			const el = containerRef.current
			if (el && document.pointerLockElement !== el) {
				try {
					const promise = el.requestPointerLock() as unknown as
						| Promise<void>
						| undefined
					if (promise && typeof promise.catch === "function") {
						promise.catch((err) => {
							console.warn("[useMouseInput] Pointer lock failed:", err)
						})
					}
				} catch (err) {
					console.warn("[useMouseInput] Pointer lock error:", err)
				}
			}
		},
		[enabled],
	)

	const unlock = useCallback(() => {
		if (document.pointerLockElement) {
			document.exitPointerLock()
		}
	}, [])

	// Monitor Pointer Lock state changes
	useEffect(() => {
		const handlePointerLockChange = () => {
			const locked = document.pointerLockElement === containerRef.current
			setIsLocked(locked)
			if (locked) {
				setShowLockHint(true)
				if (lockHintTimeoutRef.current) clearTimeout(lockHintTimeoutRef.current)
				lockHintTimeoutRef.current = setTimeout(() => {
					setShowLockHint(false)
				}, 4000)
			} else {
				setShowLockHint(false)
				if (lockHintTimeoutRef.current) clearTimeout(lockHintTimeoutRef.current)
			}
		}

		const handlePointerLockError = (e: Event) => {
			console.warn("[useMouseInput] Pointer lock error event:", e)
			setIsLocked(false)
			setShowLockHint(false)
		}

		document.addEventListener("pointerlockchange", handlePointerLockChange)
		document.addEventListener("pointerlockerror", handlePointerLockError)

		return () => {
			document.removeEventListener("pointerlockchange", handlePointerLockChange)
			document.removeEventListener("pointerlockerror", handlePointerLockError)
			if (lockHintTimeoutRef.current) clearTimeout(lockHintTimeoutRef.current)
		}
	}, [])

	// Mouse Movement & Click Listeners when Pointer Locked
	useEffect(() => {
		if (!isLocked) return

		const handleMouseMove = (e: MouseEvent) => {
			const pointerEv = e as PointerEvent
			if (pointerEv.pointerType && pointerEv.pointerType !== "mouse") {
				return
			}
			const dx = e.movementX
			const dy = e.movementY
			if (dx !== 0 || dy !== 0) {
				send({ type: "move", dx, dy })
			}
		}

		const handleMouseDown = (e: MouseEvent) => {
			const pointerEv = e as PointerEvent
			if (pointerEv.pointerType && pointerEv.pointerType !== "mouse") {
				return
			}
			const buttonMap: Record<number, "left" | "right" | "middle"> = {
				0: "left",
				1: "middle",
				2: "right",
			}
			const button = buttonMap[e.button]
			if (button) {
				send({ type: "click", button, press: true })
			}
			e.preventDefault()
		}

		const handleMouseUp = (e: MouseEvent) => {
			const pointerEv = e as PointerEvent
			if (pointerEv.pointerType && pointerEv.pointerType !== "mouse") {
				return
			}
			const buttonMap: Record<number, "left" | "right" | "middle"> = {
				0: "left",
				1: "middle",
				2: "right",
			}
			const button = buttonMap[e.button]
			if (button) {
				send({ type: "click", button, press: false })
			}
			e.preventDefault()
		}

		const handleContextMenu = (e: MouseEvent) => {
			e.preventDefault()
		}

		document.addEventListener("mousemove", handleMouseMove)
		document.addEventListener("mousedown", handleMouseDown)
		document.addEventListener("mouseup", handleMouseUp)
		document.addEventListener("contextmenu", handleContextMenu)

		return () => {
			document.removeEventListener("mousemove", handleMouseMove)
			document.removeEventListener("mousedown", handleMouseDown)
			document.removeEventListener("mouseup", handleMouseUp)
			document.removeEventListener("contextmenu", handleContextMenu)
		}
	}, [isLocked, send])

	// Wheel Event Listener for scrolling over container
	useEffect(() => {
		const container = containerRef.current
		if (!container) return

		const handleWheel = (e: WheelEvent) => {
			const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
			const dx = -e.deltaX * factor
			const dy = -e.deltaY * factor

			if (dx !== 0 || dy !== 0) {
				send({ type: "scroll", dx, dy })
			}
			e.preventDefault()
		}

		container.addEventListener("wheel", handleWheel, { passive: false })
		return () => {
			container.removeEventListener("wheel", handleWheel)
		}
	}, [send])

	// Physical Keyboard Listener when Pointer Locked
	useEffect(() => {
		if (!isLocked) return

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				return
			}

			const key = normalizeDOMKey(e.key)
			const hasModifierCombo = e.ctrlKey || e.altKey || e.metaKey

			if (hasModifierCombo) {
				const mods: string[] = []
				if (e.ctrlKey) mods.push("ctrl")
				if (e.altKey) mods.push("alt")
				if (e.metaKey) mods.push("meta")
				if (e.shiftKey) mods.push("shift")

				const isModKey = ["ctrl", "alt", "meta", "shift"].includes(key)
				const comboKeys = isModKey
					? mods
					: [...mods.filter((m) => m !== key), key]

				if (comboKeys.length > 0) {
					send({ type: "combo", keys: comboKeys })
				}
				e.preventDefault()
				return
			}

			if (
				key === "tab" ||
				key === "backspace" ||
				key === "enter" ||
				key.startsWith("arrow") ||
				key.startsWith("f") ||
				key === "space" ||
				key === "delete" ||
				key === "home" ||
				key === "end" ||
				key === "pageup" ||
				key === "pagedown" ||
				key === "insert"
			) {
				send({ type: "key", key })
				e.preventDefault()
				return
			}

			if (e.key.length === 1) {
				send({ type: "key", key })
				e.preventDefault()
			}
		}

		window.addEventListener("keydown", handleKeyDown)
		return () => {
			window.removeEventListener("keydown", handleKeyDown)
		}
	}, [isLocked, send])

	const handleClick = useCallback(
		(e: React.MouseEvent | React.PointerEvent) => {
			if (!enabled) return
			// Strictly exclude touch events — touch clicks are handled by useTrackpadGesture
			if ("pointerType" in e && e.pointerType && e.pointerType !== "mouse") {
				return
			}

			if (mouseMode) {
				// In touchscreen / mouse-mode: compute absolute position and teleport the
				// remote cursor to exactly where the user clicked.
				const ratio = toNormalisedRatio(e.clientX, e.clientY)
				if (ratio) {
					const button: "left" | "right" | "middle" = "left"
					send({
						type: "absoluteClick",
						button,
						press: true,
						x: ratio.x,
						y: ratio.y,
					})
					send({
						type: "absoluteClick",
						button,
						press: false,
						x: ratio.x,
						y: ratio.y,
					})
				}
				return
			}

			if (!isLocked) {
				requestLock(e)
			}
		},
		[enabled, isLocked, mouseMode, requestLock, send],
	)

	return {
		isLocked,
		showLockHint,
		setShowLockHint,
		containerRef,
		requestLock,
		unlock,
		handlers: {
			onClick: handleClick,
		},
	}
}
