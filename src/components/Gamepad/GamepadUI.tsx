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

	const handleStart = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault()
			setIsActive(true)
			const rect = baseRef.current?.getBoundingClientRect()
			if (rect) {
				startPos.current = {
					x: rect.left + rect.width / 2,
					y: rect.top + rect.height / 2,
				}
			}
		},
		[],
	)

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
			className={`relative w-28 h-28 rounded-full bg-base-100/30 border-2 border-base-100/50 touch-none select-none ${
				isActive ? "border-primary" : ""
			}`}
			onPointerDown={handleStart}
			onPointerMove={handleMove}
			onPointerUp={handleEnd}
			onPointerLeave={handleEnd}
			onPointerCancel={handleEnd}
		>
			<div
				className="absolute w-12 h-12 rounded-full bg-base-100 shadow-lg transition-transform duration-75"
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
		sm: "w-8 h-8 text-xs",
		md: "w-10 h-10 text-sm",
		lg: "w-12 h-12 text-base",
	}

	return (
		<button
			type="button"
			className={`${sizeClasses[size]} rounded-full font-bold transition-all duration-100 active:scale-90 ${
				pressed ? `${color} text-white` : "bg-base-100/70 text-base-content"
			}`}
			onPointerDown={() => onChange(true)}
			onPointerUp={() => onChange(false)}
			onPointerLeave={() => onChange(false)}
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

	const handleRightStick = useCallback(
		(x: number, y: number) => {
			updateState((prev) => ({ ...prev, rightStick: { x, y } }))
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
		<div className="absolute inset-0 pointer-events-none z-20">
			<div className="absolute bottom-4 left-4 pointer-events-auto">
				<Joystick
					x={state.leftStick.x}
					y={state.leftStick.y}
					onChange={handleLeftStick}
				/>
			</div>

			<div className="absolute bottom-4 right-4 pointer-events-auto">
				<Joystick
					x={state.rightStick.x}
					y={state.rightStick.y}
					onChange={handleRightStick}
				/>
			</div>

			<div className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col gap-2 pointer-events-auto">
				<div className="flex gap-2 justify-end">
					<GamepadButton
						pressed={state.buttons.y}
						onChange={(p) => handleButton("y", p)}
						label="Y"
						color="bg-yellow-500"
					/>
				</div>
				<div className="flex gap-2">
					<GamepadButton
						pressed={state.buttons.x}
						onChange={(p) => handleButton("x", p)}
						label="X"
						color="bg-blue-500"
					/>
					<GamepadButton
						pressed={state.buttons.b}
						onChange={(p) => handleButton("b", p)}
						label="B"
						color="bg-red-500"
					/>
					<GamepadButton
						pressed={state.buttons.a}
						onChange={(p) => handleButton("a", p)}
						label="A"
						color="bg-green-500"
					/>
				</div>
			</div>

			<div className="absolute left-8 top-1/2 -translate-y-1/2 flex flex-col gap-2 pointer-events-auto">
				<div className="flex gap-2 justify-center">
					<GamepadButton
						pressed={state.buttons.dpadUp}
						onChange={(p) => handleButton("dpadUp", p)}
						label="▲"
						color="bg-gray-600"
						size="sm"
					/>
				</div>
				<div className="flex gap-2 justify-center">
					<GamepadButton
						pressed={state.buttons.dpadLeft}
						onChange={(p) => handleButton("dpadLeft", p)}
						label="◀"
						color="bg-gray-600"
						size="sm"
					/>
					<GamepadButton
						pressed={state.buttons.dpadDown}
						onChange={(p) => handleButton("dpadDown", p)}
						label="▼"
						color="bg-gray-600"
						size="sm"
					/>
					<GamepadButton
						pressed={state.buttons.dpadRight}
						onChange={(p) => handleButton("dpadRight", p)}
						label="▶"
						color="bg-gray-600"
						size="sm"
					/>
				</div>
			</div>

			<div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-auto">
				<GamepadButton
					pressed={state.buttons.lt}
					onChange={(p) => handleButton("lt", p)}
					label="LT"
					color="bg-gray-700"
					size="sm"
				/>
				<GamepadButton
					pressed={state.buttons.rt}
					onChange={(p) => handleButton("rt", p)}
					label="RT"
					color="bg-gray-700"
					size="sm"
				/>
			</div>

			<div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-8 pointer-events-auto">
				<GamepadButton
					pressed={state.buttons.back}
					onChange={(p) => handleButton("back", p)}
					label="◀"
					color="bg-gray-600"
					size="sm"
				/>
				<GamepadButton
					pressed={state.buttons.start}
					onChange={(p) => handleButton("start", p)}
					label="▶"
					color="bg-gray-600"
					size="sm"
				/>
			</div>
		</div>
	)
}
