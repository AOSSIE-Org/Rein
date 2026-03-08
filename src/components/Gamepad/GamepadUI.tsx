"use client"

import type React from "react"
import { useCallback, useRef, useState } from "react"

interface GamepadUIProps {
	onStateChange: (state: GamepadState) => void
	visible: boolean
}

export interface GamepadState {
	leftStick: { x: number; y: number }
	rightStick: { x: number; y: number }
	buttons: {
		a: boolean
		b: boolean
		x: boolean
		y: boolean
		lb: boolean
		rb: boolean
		lt: boolean
		rt: boolean
		back: boolean
		start: boolean
		l3: boolean
		r3: boolean
		dpadUp: boolean
		dpadDown: boolean
		dpadLeft: boolean
		dpadRight: boolean
	}
}

const createInitialState = (): GamepadState => ({
	leftStick: { x: 0, y: 0 },
	rightStick: { x: 0, y: 0 },
	buttons: {
		a: false,
		b: false,
		x: false,
		y: false,
		lb: false,
		rb: false,
		lt: false,
		rt: false,
		back: false,
		start: false,
		l3: false,
		r3: false,
		dpadUp: false,
		dpadDown: false,
		dpadLeft: false,
		dpadRight: false,
	},
})

interface StickProps {
	x: number
	y: number
	onChange: (x: number, y: number) => void
}

const Joystick = ({ x, y, onChange }: StickProps) => {
	const baseRef = useRef<HTMLDivElement>(null)
	const [isActive, setIsActive] = useState(false)
	const startPos = useRef({ x: 0, y: 0 })

	const handleStart = useCallback((e: React.PointerEvent) => {
		e.preventDefault()
		setIsActive(true)
		const rect = baseRef.current?.getBoundingClientRect()
		if (rect) {
			startPos.current = {
				x: rect.left + rect.width / 2,
				y: rect.top + rect.height / 2,
			}
		}
	}, [])

	const handleMove = useCallback(
		(e: React.PointerEvent) => {
			if (!isActive) return
			e.preventDefault()

			const rect = baseRef.current?.getBoundingClientRect()
			if (!rect) return

			const centerX = rect.left + rect.width / 2
			const centerY = rect.top + rect.height / 2
			const maxRadius = rect.width / 2

			let deltaX = e.clientX - centerX
			let deltaY = e.clientY - centerY

			const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
			if (distance > maxRadius) {
				deltaX = (deltaX / distance) * maxRadius
				deltaY = (deltaY / distance) * maxRadius
			}

			const normalizedX = deltaX / maxRadius
			const normalizedY = deltaY / maxRadius

			onChange(normalizedX, normalizedY)
		},
		[isActive, onChange],
	)

	const handleEnd = useCallback(() => {
		setIsActive(false)
		onChange(0, 0)
	}, [onChange])

	const stickX = x * 25
	const stickY = y * 25

	return (
		<div
			ref={baseRef}
			className={`relative w-24 h-24 rounded-full bg-white/20 border-2 border-white/40 touch-none select-none ${
				isActive ? "border-green-400" : ""
			}`}
			onPointerDown={handleStart}
			onPointerMove={handleMove}
			onPointerUp={handleEnd}
			onPointerLeave={handleEnd}
			onPointerCancel={handleEnd}
		>
			<div
				className="absolute w-12 h-12 rounded-full bg-white/80 shadow-lg transition-transform duration-75"
				style={{
					left: "50%",
					top: "50%",
					transform: `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`,
				}}
			/>
		</div>
	)
}

interface ButtonProps {
	pressed: boolean
	onChange: (pressed: boolean) => void
	label: string
	color: string
	size?: "sm" | "md" | "lg"
}

const GamepadButton = ({
	pressed,
	onChange,
	label,
	color,
	size = "md",
}: ButtonProps) => {
	const sizeClasses = {
		sm: "w-10 h-10 text-sm",
		md: "w-12 h-12 text-base",
		lg: "w-14 h-14 text-lg",
	}

	return (
		<button
			type="button"
			tabIndex={-1}
			className={`${sizeClasses[size]} rounded-full font-bold shadow-lg transition-all duration-75 active:scale-95 touch-none select-none ${
				pressed
					? `${color} text-white ring-2 ring-white`
					: "bg-white/70 text-gray-800"
			}`}
			onPointerDown={(e) => {
				e.preventDefault()
				onChange(true)
			}}
			onPointerUp={(e) => {
				e.preventDefault()
				onChange(false)
			}}
			onPointerLeave={(e) => {
				e.preventDefault()
				onChange(false)
			}}
			onPointerCancel={(e) => {
				e.preventDefault()
				onChange(false)
			}}
		>
			{label}
		</button>
	)
}

export const GamepadUI = ({ onStateChange, visible }: GamepadUIProps) => {
	const [state, setState] = useState<GamepadState>(createInitialState)

	const updateState = useCallback(
		(updater: (prev: GamepadState) => GamepadState) => {
			setState((prev) => {
				const newState = updater(prev)
				onStateChange(newState)
				return newState
			})
		},
		[onStateChange],
	)

	const handleLeftStick = useCallback(
		(x: number, y: number) => {
			updateState((prev) => ({ ...prev, leftStick: { x, y } }))
		},
		[updateState],
	)

	const handleButton = useCallback(
		(button: keyof GamepadState["buttons"], pressed: boolean) => {
			updateState((prev) => ({
				...prev,
				buttons: { ...prev.buttons, [button]: pressed },
			}))
		},
		[updateState],
	)

	if (!visible) return null

	return (
		<div className="absolute inset-0 pointer-events-none z-40">
			<div className="absolute bottom-4 left-4 pointer-events-auto">
				<Joystick
					x={state.leftStick.x}
					y={state.leftStick.y}
					onChange={handleLeftStick}
				/>
			</div>

			<div className="absolute right-6 bottom-8 flex flex-col gap-2 pointer-events-auto">
				<div className="flex gap-2 justify-end">
					<GamepadButton
						pressed={state.buttons.y}
						onChange={(p) => handleButton("y", p)}
						label="Y"
						color="bg-yellow-500"
						size="lg"
					/>
				</div>
				<div className="flex gap-2">
					<GamepadButton
						pressed={state.buttons.x}
						onChange={(p) => handleButton("x", p)}
						label="X"
						color="bg-blue-500"
						size="lg"
					/>
					<GamepadButton
						pressed={state.buttons.b}
						onChange={(p) => handleButton("b", p)}
						label="B"
						color="bg-red-500"
						size="lg"
					/>
					<GamepadButton
						pressed={state.buttons.a}
						onChange={(p) => handleButton("a", p)}
						label="A"
						color="bg-green-500"
						size="lg"
					/>
				</div>
			</div>
		</div>
	)
}
