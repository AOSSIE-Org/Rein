// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useTrackpadGesture } from "@/hooks/useTrackpadGesture"

interface TouchPoint {
	identifier: number
	pageX: number
	pageY: number
	clientX: number
	clientY: number
}

type GestureHandlers = ReturnType<typeof useTrackpadGesture>["handlers"]
type TouchEventArg = Parameters<GestureHandlers["onTouchStart"]>[0]

function touch(
	identifier: number,
	pageX: number,
	pageY = 0,
	clientX = pageX,
	clientY = pageY,
): TouchPoint {
	return { identifier, pageX, pageY, clientX, clientY }
}

function event(touches: TouchPoint[], timeStamp: number): TouchEventArg {
	return { changedTouches: touches, timeStamp } as unknown as TouchEventArg
}

function mountGesture(scrollMode = false) {
	const send = vi.fn()
	const hook = renderHook(() => useTrackpadGesture(send, scrollMode))
	return { ...hook, send }
}

beforeEach(() => {
	vi.useFakeTimers()
	localStorage.clear()
})

afterEach(() => {
	cleanup()
	vi.useRealTimers()
	document.body.replaceChildren()
	vi.restoreAllMocks()
})

describe("useTrackpadGesture touch behavior", () => {
	it("tracks a one-finger tap as a left click and releases it after the drag window", () => {
		const { result, send } = mountGesture()
		act(() => {
			result.current.handlers.onTouchStart(event([touch(1, 20, 30)], 0))
		})
		expect(result.current.isTracking).toBe(true)
		act(() => {
			result.current.handlers.onTouchEnd(event([touch(1, 20, 30)], 100))
		})
		expect(result.current.isTracking).toBe(false)
		expect(send).toHaveBeenCalledWith({
			type: "click",
			button: "left",
			press: true,
		})

		act(() => vi.advanceTimersByTime(250))
		expect(send).toHaveBeenLastCalledWith({
			type: "click",
			button: "left",
			press: false,
		})
	})

	it.each([
		{ fingers: 2, button: "right" },
		{ fingers: 3, button: "middle" },
	] as const)(
		"classifies a $fingers-finger tap as a $button click",
		({ fingers, button }) => {
			const { result, send } = mountGesture()
			const touches = Array.from({ length: fingers }, (_, index) =>
				touch(index + 1, index * 30),
			)
			act(() => {
				result.current.handlers.onTouchStart(event(touches, 0))
				result.current.handlers.onTouchEnd(event(touches, 100))
			})

			expect(send).toHaveBeenNthCalledWith(1, {
				type: "click",
				button,
				press: true,
			})
			expect(send).toHaveBeenNthCalledWith(2, {
				type: "click",
				button,
				press: false,
			})
		},
	)

	it("sends one-finger movement after the movement threshold and does not click", () => {
		const { result, send } = mountGesture()
		act(() => {
			result.current.handlers.onTouchStart(event([touch(1, 10, 10)], 0))
			result.current.handlers.onTouchMove(event([touch(1, 25, 14)], 30))
		})

		expect(send).toHaveBeenCalledWith({ type: "move", dx: 15, dy: 4 })
		act(() => {
			result.current.handlers.onTouchEnd(event([touch(1, 25, 14)], 50))
		})
		expect(send).toHaveBeenCalledTimes(1)
	})

	it("turns two-finger parallel movement into scrolling", () => {
		const { result, send } = mountGesture()
		act(() => {
			result.current.handlers.onTouchStart(
				event([touch(1, 0), touch(2, 50)], 0),
			)
			result.current.handlers.onTouchMove(
				event([touch(1, 20), touch(2, 70)], 30),
			)
		})

		expect(send).toHaveBeenCalledWith({ type: "scroll", dx: -20, dy: -0 })
	})

	it("turns a two-finger distance change beyond the pinch threshold into zoom", () => {
		const { result, send } = mountGesture()
		act(() => {
			result.current.handlers.onTouchStart(
				event([touch(1, 0), touch(2, 50)], 0),
			)
			result.current.handlers.onTouchMove(event([touch(2, 70)], 30))
		})

		expect(send).toHaveBeenCalledWith({ type: "zoom", delta: 20 })
	})

	it("filters the non-dominant axis in scroll mode", () => {
		const { result, send } = mountGesture(true)
		act(() => {
			result.current.handlers.onTouchStart(event([touch(1, 0, 0)], 0))
			result.current.handlers.onTouchMove(event([touch(1, 30, 2)], 30))
		})

		expect(send).toHaveBeenCalledWith({ type: "scroll", dx: -30, dy: -0 })
	})

	it("releases an active drag and clears tracking when touch input is cancelled", () => {
		const { result, send } = mountGesture()
		act(() => {
			result.current.handlers.onTouchStart(event([touch(1, 0)], 0))
			result.current.handlers.onTouchEnd(event([touch(1, 0)], 50))
		})
		act(() => {
			result.current.handlers.onTouchStart(event([touch(2, 0)], 100))
			result.current.handlers.onTouchMove(event([touch(2, 20)], 120))
			result.current.handlers.onTouchCancel(event([touch(2, 20)], 130))
		})

		expect(result.current.isTracking).toBe(false)
		expect(send).toHaveBeenLastCalledWith({
			type: "click",
			button: "left",
			press: false,
		})
		expect(vi.getTimerCount()).toBe(0)
	})

	it("maps a mouse-mode tap to the visible screen mirror coordinates", () => {
		localStorage.setItem("rein_mouse_mode", "true")
		const video = document.createElement("video")
		video.id = "screenMirror"
		Object.defineProperties(video, {
			videoWidth: { configurable: true, value: 1920 },
			videoHeight: { configurable: true, value: 1080 },
		})
		vi.spyOn(video, "getBoundingClientRect").mockReturnValue({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 200,
			bottom: 100,
			width: 200,
			height: 100,
			toJSON: () => ({}),
		})
		document.body.append(video)
		const { result, send } = mountGesture()
		act(() => {
			result.current.handlers.onTouchStart(event([touch(1, 100, 50)], 0))
			result.current.handlers.onTouchEnd(event([touch(1, 100, 50)], 100))
		})

		expect(send).toHaveBeenCalledWith({
			type: "absoluteClick",
			button: "left",
			press: true,
			x: 0.5,
			y: 0.5,
		})
	})

	it("clears the pending click timer and storage listener when unmounted", () => {
		const addListener = vi.spyOn(window, "addEventListener")
		const removeListener = vi.spyOn(window, "removeEventListener")
		const schedule = vi.spyOn(globalThis, "setTimeout")
		const clear = vi.spyOn(globalThis, "clearTimeout")
		const { result, unmount } = mountGesture()
		const storageListener = addListener.mock.calls.find(
			([type]) => type === "storage",
		)?.[1]
		act(() => {
			result.current.handlers.onTouchStart(event([touch(1, 0)], 0))
			result.current.handlers.onTouchEnd(event([touch(1, 0)], 100))
		})
		const dragTimeoutIndex = schedule.mock.calls.findIndex(
			([, delay]) => delay === 250,
		)
		expect(dragTimeoutIndex).toBeGreaterThanOrEqual(0)
		const dragTimeout = schedule.mock.results[dragTimeoutIndex].value

		unmount()

		expect(clear).toHaveBeenCalledWith(dragTimeout)
		expect(removeListener).toHaveBeenCalledWith("storage", storageListener)
	})
})
