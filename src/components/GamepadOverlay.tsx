/**
 * GamepadOverlay.tsx
 *
 * Proof-of-concept for Issue #223: On-Screen Gamepad Support for Screen Mirroring.
 *
 * Renders a virtual gamepad overlay on top of the screen mirror view.
 * Touch events on the virtual controls are transmitted over the existing
 * WebSocket connection as gamepad messages to the server.
 *
 * Server receives { type: "gamepad-button", button, pressed } or
 * { type: "gamepad-axis", axis, x, y } and routes them through the
 * VirtualInputDriver's gamepad methods (LinuxUinputDriver uinput gamepad device).
 *
 * Full GSoC implementation will:
 * - Wire this into the screen-mirror route (screen.tsx)
 * - Add server-side handler in websocket.ts for gamepad message types
 * - Add gamepad capability bits to LinuxUinputDriver (BTN_GAMEPAD, BTN_A/B/X/Y, ABS_X/Y)
 * - Add ViGEmBus bindings for Windows gamepad emulation
 * - Test with SuperTuxKart and jstest/joy.cpl
 */

"use client"

import type React from "react"
import { useCallback, useRef } from "react"

// ── Types ────────────────────────────────────────────────────────────────────

interface GamepadOverlayProps {
	wsRef: React.RefObject<WebSocket | null>
	visible: boolean
}

// Standard gamepad button indices (matching the Web Gamepad API)
const BUTTONS = {
	A: 0,
	B: 1,
	X: 2,
	Y: 3,
	LB: 4,
	RB: 5,
	SELECT: 8,
	START: 9,
	L3: 10,
	R3: 11,
	DPAD_UP: 12,
	DPAD_DOWN: 13,
	DPAD_LEFT: 14,
	DPAD_RIGHT: 15,
} as const

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
	return Math.max(min, Math.min(max, v))
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface ButtonProps {
	label: string
	buttonIndex: number
	onPress: (button: number, pressed: boolean) => void
	color?: string
}

function VirtualButton({
	label,
	buttonIndex,
	onPress,
	color = "#ffffff30",
}: ButtonProps) {
	return (
		<button
			style={{
				width: 48,
				height: 48,
				borderRadius: "50%",
				background: color,
				border: "2px solid #ffffff60",
				color: "white",
				fontWeight: "bold",
				fontSize: 14,
				touchAction: "none",
				userSelect: "none",
				cursor: "pointer",
			}}
			onPointerDown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId)
				onPress(buttonIndex, true)
			}}
			onPointerUp={() => onPress(buttonIndex, false)}
			onPointerCancel={() => onPress(buttonIndex, false)}
		>
			{label}
		</button>
	)
}

interface JoystickProps {
	side: "left" | "right"
	axisIndex: number
	onMove: (axis: number, x: number, y: number) => void
}

function VirtualJoystick({ side, axisIndex, onMove }: JoystickProps) {
	const baseRef = useRef<HTMLDivElement>(null)
	const thumbRef = useRef<HTMLDivElement>(null)
	const activeRef = useRef<{
		pointerId: number
		baseX: number
		baseY: number
	} | null>(null)

	const RADIUS = 40
	const THUMB_SIZE = 28

	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		if (!baseRef.current) return
		const rect = baseRef.current.getBoundingClientRect()
		const centerX = rect.left + rect.width / 2
		const centerY = rect.top + rect.height / 2
		activeRef.current = {
			pointerId: e.pointerId,
			baseX: centerX,
			baseY: centerY,
		}
		;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
	}, [])

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!activeRef.current || e.pointerId !== activeRef.current.pointerId)
				return
			const dx = e.clientX - activeRef.current.baseX
			const dy = e.clientY - activeRef.current.baseY
			const dist = Math.sqrt(dx * dx + dy * dy)
			const factor = dist > RADIUS ? RADIUS / dist : 1

			const nx = clamp((dx * factor) / RADIUS, -1, 1)
			const ny = clamp((dy * factor) / RADIUS, -1, 1)

			if (thumbRef.current) {
				thumbRef.current.style.transform = `translate(${nx * RADIUS}px, ${ny * RADIUS}px)`
			}

			onMove(axisIndex, nx, ny)
		},
		[axisIndex, onMove],
	)

	const handlePointerUp = useCallback(() => {
		activeRef.current = null
		if (thumbRef.current) {
			thumbRef.current.style.transform = "translate(0, 0)"
		}
		onMove(axisIndex, 0, 0)
	}, [axisIndex, onMove])

	return (
		<div
			ref={baseRef}
			style={{
				width: RADIUS * 2 + THUMB_SIZE,
				height: RADIUS * 2 + THUMB_SIZE,
				borderRadius: "50%",
				background: "#ffffff15",
				border: "2px solid #ffffff40",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				touchAction: "none",
				position: "relative",
			}}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
		>
			<div
				ref={thumbRef}
				style={{
					width: THUMB_SIZE,
					height: THUMB_SIZE,
					borderRadius: "50%",
					background: "#ffffffa0",
					position: "absolute",
					transition: activeRef.current ? "none" : "transform 0.1s",
					pointerEvents: "none",
				}}
			/>
		</div>
	)
}

// ── Main component ───────────────────────────────────────────────────────────

export function GamepadOverlay({ wsRef, visible }: GamepadOverlayProps) {
	const send = useCallback(
		(msg: object) => {
			if (wsRef.current?.readyState === WebSocket.OPEN) {
				wsRef.current.send(JSON.stringify(msg))
			}
		},
		[wsRef],
	)

	const handleButton = useCallback(
		(button: number, pressed: boolean) => {
			send({ type: "gamepad-button", button, pressed })
		},
		[send],
	)

	const handleAxis = useCallback(
		(axis: number, x: number, y: number) => {
			send({ type: "gamepad-axis", axis, x, y })
		},
		[send],
	)

	if (!visible) return null

	return (
		<div
			style={{
				position: "fixed",
				bottom: 0,
				left: 0,
				right: 0,
				height: 200,
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				padding: "0 24px",
				background: "linear-gradient(to top, #00000080, transparent)",
				pointerEvents: "auto",
				zIndex: 100,
				touchAction: "none",
			}}
		>
			{/* Left joystick */}
			<VirtualJoystick side="left" axisIndex={0} onMove={handleAxis} />

			{/* D-pad */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(3, 40px)",
					gap: 4,
				}}
			>
				<div />
				<VirtualButton
					label="▲"
					buttonIndex={BUTTONS.DPAD_UP}
					onPress={handleButton}
				/>
				<div />
				<VirtualButton
					label="◀"
					buttonIndex={BUTTONS.DPAD_LEFT}
					onPress={handleButton}
				/>
				<div />
				<VirtualButton
					label="▶"
					buttonIndex={BUTTONS.DPAD_RIGHT}
					onPress={handleButton}
				/>
				<div />
				<VirtualButton
					label="▼"
					buttonIndex={BUTTONS.DPAD_DOWN}
					onPress={handleButton}
				/>
				<div />
			</div>

			{/* Center buttons */}
			<div style={{ display: "flex", gap: 12 }}>
				<VirtualButton
					label="⊟"
					buttonIndex={BUTTONS.SELECT}
					onPress={handleButton}
				/>
				<VirtualButton
					label="⊞"
					buttonIndex={BUTTONS.START}
					onPress={handleButton}
				/>
			</div>

			{/* Face buttons (ABXY) */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(3, 48px)",
					gap: 4,
				}}
			>
				<div />
				<VirtualButton
					label="Y"
					buttonIndex={BUTTONS.Y}
					onPress={handleButton}
					color="#ffff0040"
				/>
				<div />
				<VirtualButton
					label="X"
					buttonIndex={BUTTONS.X}
					onPress={handleButton}
					color="#0080ff40"
				/>
				<div />
				<VirtualButton
					label="B"
					buttonIndex={BUTTONS.B}
					onPress={handleButton}
					color="#ff000040"
				/>
				<div />
				<VirtualButton
					label="A"
					buttonIndex={BUTTONS.A}
					onPress={handleButton}
					color="#00cc0040"
				/>
				<div />
			</div>

			{/* Right joystick */}
			<VirtualJoystick side="right" axisIndex={1} onMove={handleAxis} />
		</div>
	)
}
