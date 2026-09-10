"use client"

import type React from "react"
import { useEffect, useState, useRef } from "react"

export type LayoutGroup =
	| "leftShoulder"
	| "rightShoulder"
	| "dpad"
	| "leftStick"
	| "rightStick"
	| "startSelect"
	| "faceButtons"

export interface Placement {
	x: number // % from left of the overlay container, center-anchored
	y: number // % from top
	scale: number // independent per-group scale
}

export type GamepadButtonLayout = Record<LayoutGroup, Placement>

export const DEFAULT_GAMEPAD_LAYOUT: GamepadButtonLayout = {
	leftShoulder: { x: 12, y: 10, scale: 1 },
	rightShoulder: { x: 88, y: 10, scale: 1 },
	dpad: { x: 18, y: 74, scale: 1 },
	leftStick: { x: 18, y: 90, scale: 1 },
	startSelect: { x: 50, y: 88, scale: 1 },
	faceButtons: { x: 82, y: 74, scale: 1 },
	rightStick: { x: 82, y: 90, scale: 1 },
}

export type GamepadButtonId =
	| "a"
	| "b"
	| "x"
	| "y"
	| "lb"
	| "rb"
	| "lt"
	| "rt"
	| "start"
	| "select"
	| "dpad-up"
	| "dpad-down"
	| "dpad-left"
	| "dpad-right"
	| "ls"
	| "rs"
	| "ls-up"
	| "ls-down"
	| "ls-left"
	| "ls-right"
	| "rs-up"
	| "rs-down"
	| "rs-left"
	| "rs-right"

interface GamepadOverlayProps {
	layout: GamepadButtonLayout
	/** Active (pressed) button IDs — used in the live gamepad route */
	activeButtons?: Set<GamepadButtonId>
	/** Callback when a button is pressed/released — used in the live gamepad route */
	onButtonChange?: (id: GamepadButtonId, pressed: boolean) => void
	/** Callback on stick axis move; ax/ay normalised -1…+1 */
	onAxisChange?: (axis: "ls" | "rs", ax: number, ay: number) => void
	/** When true, the overlay is non-interactive (used for settings preview) */
	preview?: boolean
	/** When true (settings preview only), groups can be selected/dragged */
	editable?: boolean
	selectedGroup?: LayoutGroup | null
	onSelectGroup?: (id: LayoutGroup) => void
	onDragGroup?: (id: LayoutGroup, x: number, y: number) => void
}

// ─── Button style helpers ─────────────────────────────────────────────────────

const SHOULDER_BASE =
	"bg-base-100/80 border-base-300 text-base-content backdrop-blur-md"

const BASE = 360
const btnSm = BASE * 0.072
const btnFace = BASE * 0.1
const stickSz = BASE * 0.22
const dpadSz = BASE * 0.19
const shoulderH = BASE * 0.06
const shoulderW = BASE * 0.16
const triggerH = BASE * 0.045
const triggerW = BASE * 0.14

// ─── Sub-components ───────────────────────────────────────────────────────────

interface BtnProps {
	id: GamepadButtonId
	label: string
	className?: string
	style?: React.CSSProperties
	active: boolean
	onPress: (id: GamepadButtonId, down: boolean) => void
	interactive: boolean
}

function Btn({
	id,
	label,
	className = "",
	style,
	active,
	onPress,
	interactive,
}: BtnProps) {
	const handlers = interactive
		? {
				onPointerDown: (e: React.PointerEvent) => {
					e.stopPropagation()
					e.currentTarget.setPointerCapture(e.pointerId)
					onPress(id, true)
				},
				onPointerUp: (e: React.PointerEvent) => {
					e.stopPropagation()
					onPress(id, false)
				},
				onPointerCancel: (e: React.PointerEvent) => {
					e.stopPropagation()
					onPress(id, false)
				},
			}
		: {}

	return (
		<button
			type="button"
			id={`gamepad-btn-${id}`}
			aria-label={`Gamepad ${label}`}
			aria-pressed={active}
			className={`select-none z-10 touch-none rounded-full border-2 font-bold transition-all duration-75 flex items-center justify-center
				${active ? "scale-90 brightness-75" : "hover:brightness-110 active:scale-90"}
				${interactive ? "cursor-pointer" : "cursor-default pointer-events-none"}
				${className}`}
			style={style}
			{...handlers}
		>
			{label}
		</button>
	)
}

// ─── D-Pad ────────────────────────────────────────────────────────────────────

interface DPadProps {
	size: number
	active: Set<GamepadButtonId>
	onPress: (id: GamepadButtonId, down: boolean) => void
	interactive: boolean
}

function DPad({ size, active, onPress, interactive }: DPadProps) {
	const arm = size * 0.32
	const center = size * 0.36

	const dPadDirections: Array<{
		id: GamepadButtonId
		label: string
		top: number
		left: number
	}> = [
		{ id: "dpad-up", label: "↑", top: 0, left: size / 2 - arm / 2 },
		{ id: "dpad-down", label: "↓", top: size - arm, left: size / 2 - arm / 2 },
		{ id: "dpad-left", label: "←", top: size / 2 - arm / 2, left: 0 },
		{ id: "dpad-right", label: "→", top: size / 2 - arm / 2, left: size - arm },
	]

	return (
		<div className="relative" style={{ width: size, height: size }}>
			<div
				className="absolute z-10 bg-base-200/70 rounded-sm"
				style={{
					width: center,
					height: center,
					top: (size - center) / 2,
					left: (size - center) / 2,
				}}
			/>
			{dPadDirections.map(({ id, label, top, left }) => (
				<Btn
					key={id}
					id={id}
					label={label}
					className={`absolute ${SHOULDER_BASE} text-xs`}
					style={{ width: arm, height: arm, top, left, borderRadius: 4 }}
					active={active.has(id)}
					onPress={onPress}
					interactive={interactive}
				/>
			))}
		</div>
	)
}

interface StickProps {
	idPrefix: "ls" | "rs"
	size: number
	active: Set<GamepadButtonId>
	onPress: (id: GamepadButtonId, down: boolean) => void
	/** Fires continuously as the stick moves; ax/ay are normalised -1…+1 */
	onAxisChange?: (axis: "ls" | "rs", ax: number, ay: number) => void
	interactive: boolean
}

function AnalogStick({
	idPrefix,
	size,
	active,
	onPress,
	onAxisChange,
	interactive,
}: StickProps) {
	const outer = size
	const maxTravel = outer * 0.32
	const innerSize = outer * 0.52

	const containerRef = useRef<HTMLDivElement | null>(null)
	const nubElRef = useRef<HTMLDivElement | null>(null)
	const isDragging = useRef(false)

	const applyNub = (rawX: number, rawY: number, release = false) => {
		let nx = rawX
		let ny = rawY
		if (release) {
			nx = 0
			ny = 0
		} else {
			const dist = Math.sqrt(nx * nx + ny * ny)
			if (dist > maxTravel) {
				nx = (nx / dist) * maxTravel
				ny = (ny / dist) * maxTravel
			}
		}
		if (nubElRef.current) {
			nubElRef.current.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`
		}
		const ax = nx / maxTravel
		const ay = ny / maxTravel
		onAxisChange?.(idPrefix, ax, ay)
	}

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!interactive) return

		e.stopPropagation()
		e.currentTarget.setPointerCapture(e.pointerId)

		isDragging.current = true

		console.log("Handle down")

		const rect = containerRef.current?.getBoundingClientRect()
		if (!rect) return

		const cx = rect.left + rect.width / 2
		const cy = rect.top + rect.height / 2

		applyNub(e.clientX - cx, e.clientY - cy)

		// If pressed near the center, treat it as LS/RS button press
		const dx = e.clientX - cx
		const dy = e.clientY - cy
		const distance = Math.sqrt(dx * dx + dy * dy)

		if (distance <= innerSize / 2) {
			onPress(idPrefix, true)
		}
	}

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!interactive || !isDragging.current || !containerRef.current) return

		e.stopPropagation()

		console.log("Handle move")

		const rect = containerRef.current.getBoundingClientRect()
		const cx = rect.left + rect.width / 2
		const cy = rect.top + rect.height / 2

		applyNub(e.clientX - cx, e.clientY - cy)
	}

	const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!interactive) return

		e.stopPropagation()

		console.log("Handle up")

		isDragging.current = false
		applyNub(0, 0, true)

		// Release LS/RS button
		onPress(idPrefix, false)
	}

	return (
		<div
			ref={containerRef}
			className="relative flex items-center justify-center select-none touch-none"
			style={{ width: outer, height: outer }}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
		>
			{/* Outer ring */}
			<div
				className="absolute rounded-full bg-base-200/30 border-2 border-base-300/50"
				style={{ width: outer, height: outer }}
			/>
			{/* Crosshair guides */}
			<div
				className="absolute bg-base-300/20 pointer-events-none"
				style={{ width: 1, height: outer * 0.6, top: "20%", left: "50%" }}
			/>
			<div
				className="absolute bg-base-300/20 pointer-events-none"
				style={{ height: 1, width: outer * 0.6, left: "20%", top: "50%" }}
			/>
			{/* Nub — positioned absolutely at center, moved via transform */}
			<div
				ref={nubElRef}
				className="absolute z-10"
				style={{
					width: innerSize,
					height: innerSize,
					top: "50%",
					left: "50%",
					transform: "translate(-50%, -50%)",
				}}
			>
				<div
					id={`gamepad-btn-${idPrefix}`}
					className={`w-full h-full rounded-full border-2 flex items-center justify-center
						${active.has(idPrefix) ? "brightness-75" : ""}
						${SHOULDER_BASE} shadow-inner`}
					style={{ pointerEvents: "none" }}
				></div>
			</div>
		</div>
	)
}

// ─── Draggable group wrapper ───────────────────────────────────────────────────

interface GroupProps {
	id: LayoutGroup
	placement: Placement
	editable: boolean
	selected: boolean
	containerRef: React.RefObject<HTMLDivElement | null>
	onSelect?: (id: LayoutGroup) => void
	onDrag?: (id: LayoutGroup, x: number, y: number) => void
	children: React.ReactNode
}

function Group({
	id,
	placement,
	editable,
	selected,
	containerRef,
	onSelect,
	onDrag,
	children,
}: GroupProps) {
	const dragging = useRef(false)

	const handlePointerDown = (e: React.PointerEvent) => {
		if (!editable) return
		e.stopPropagation()
		onSelect?.(id)
		dragging.current = true
		;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
	}

	const handlePointerMove = (e: React.PointerEvent) => {
		if (!editable || !dragging.current || !containerRef.current) return
		const rect = containerRef.current.getBoundingClientRect()
		const x = ((e.clientX - rect.left) / rect.width) * 100
		const y = ((e.clientY - rect.top) / rect.height) * 100
		onDrag?.(id, Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y)))
	}

	const stopDrag = () => {
		dragging.current = false
	}

	return (
		<div
			className={`absolute pointer-events-auto ${editable ? "cursor-move" : ""} ${
				editable && selected
					? "ring-2 ring-primary ring-offset-4 ring-offset-transparent rounded-xl"
					: ""
			}`}
			style={{
				left: `${placement.x}%`,
				top: `${placement.y}%`,
				transform: `translate(-50%, -50%) scale(${placement.scale})`,
			}}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={stopDrag}
			onPointerCancel={stopDrag}
		>
			{children}
		</div>
	)
}

// ─── Main Overlay ─────────────────────────────────────────────────────────────

export function GamepadOverlay({
	layout,
	activeButtons = new Set(),
	onButtonChange,
	onAxisChange,
	preview = false,
	editable = false,
	selectedGroup = null,
	onSelectGroup,
	onDragGroup,
}: GamepadOverlayProps) {
	const containerRef = useRef<HTMLDivElement | null>(null)
	const interactive = !preview && !editable && !!onButtonChange
	const [videoRect, setVideoRect] = useState({
		left: 0,
		top: 0,
		width: 0,
		height: 0,
	})

	useEffect(() => {
		const video = document.getElementById(
			"screenMirror",
		) as HTMLVideoElement | null

		if (!video) return

		const updateVideoRect = () => {
			const container = containerRef.current

			if (!container) return

			const rect = video.getBoundingClientRect()

			const videoWidth = video.videoWidth
			const videoHeight = video.videoHeight

			// Until WebRTC provides the video's intrinsic dimensions,
			// use the entire video element.
			if (!videoWidth || !videoHeight) {
				setVideoRect({
					left: 0,
					top: 0,
					width: rect.width,
					height: rect.height,
				})
				return
			}

			const videoAspect = videoWidth / videoHeight
			const containerAspect = rect.width / rect.height

			let renderedWidth: number
			let renderedHeight: number

			if (containerAspect > videoAspect) {
				// Video is narrower than the container.
				// There are black bars on the left/right.
				renderedHeight = rect.height
				renderedWidth = renderedHeight * videoAspect
			} else {
				// Video is wider than the container.
				// There are black bars on the top/bottom.
				renderedWidth = rect.width
				renderedHeight = renderedWidth / videoAspect
			}

			const left = (rect.width - renderedWidth) / 2
			const top = (rect.height - renderedHeight) / 2

			setVideoRect({
				left,
				top,
				width: renderedWidth,
				height: renderedHeight,
			})
		}

		const update = () => {
			requestAnimationFrame(updateVideoRect)
		}

		update()

		video.addEventListener("loadedmetadata", update)
		video.addEventListener("resize", update)

		const resizeObserver = new ResizeObserver(update)
		resizeObserver.observe(video)

		window.addEventListener("resize", update)

		return () => {
			video.removeEventListener("loadedmetadata", update)
			video.removeEventListener("resize", update)
			resizeObserver.disconnect()
			window.removeEventListener("resize", update)
		}
	}, [])

	const handlePress = (id: GamepadButtonId, pressed: boolean) => {
		if (interactive && onButtonChange) onButtonChange(id, pressed)
	}

	const groupProps = (id: LayoutGroup) => ({
		id,
		placement: layout[id],
		editable,
		selected: selectedGroup === id,
		containerRef,
		onSelect: onSelectGroup,
		onDrag: onDragGroup,
	})

	return (
		<div
			ref={containerRef}
			className="absolute flex justify-center items-center inset-0 pointer-events-none z-20"
		>
			{/* Left shoulder: LT + LB */}
			<div
				className="absolute"
				style={{
					left: `${videoRect.left}px`,
					top: `${videoRect.top}px`,
					width: `${videoRect.width}px`,
					height: `${videoRect.height}px`,
				}}
			>
				<Group {...groupProps("leftShoulder")}>
					<div className="flex flex-col items-center gap-1">
						<Btn
							id="lt"
							label="LT"
							className={`rounded border-2 font-bold text-xs ${SHOULDER_BASE}`}
							style={{ width: triggerW, height: triggerH }}
							active={activeButtons.has("lt")}
							onPress={handlePress}
							interactive={interactive}
						/>
						<Btn
							id="lb"
							label="LB"
							className={`rounded-md border-2 font-bold text-xs ${SHOULDER_BASE}`}
							style={{ width: shoulderW, height: shoulderH }}
							active={activeButtons.has("lb")}
							onPress={handlePress}
							interactive={interactive}
						/>
					</div>
				</Group>

				{/* Right shoulder: RT + RB */}
				<Group {...groupProps("rightShoulder")}>
					<div className="flex flex-col items-center gap-1">
						<Btn
							id="rt"
							label="RT"
							className={`rounded border-2 font-bold text-xs ${SHOULDER_BASE}`}
							style={{ width: triggerW, height: triggerH }}
							active={activeButtons.has("rt")}
							onPress={handlePress}
							interactive={interactive}
						/>
						<Btn
							id="rb"
							label="RB"
							className={`rounded-md border-2 font-bold text-xs ${SHOULDER_BASE}`}
							style={{ width: shoulderW, height: shoulderH }}
							active={activeButtons.has("rb")}
							onPress={handlePress}
							interactive={interactive}
						/>
					</div>
				</Group>

				{/* D-pad */}
				<Group {...groupProps("dpad")}>
					<DPad
						size={dpadSz}
						active={activeButtons}
						onPress={handlePress}
						interactive={interactive}
					/>
				</Group>

				{/* Left stick */}
				<Group {...groupProps("leftStick")}>
					<AnalogStick
						idPrefix="ls"
						size={stickSz}
						active={activeButtons}
						onPress={handlePress}
						onAxisChange={onAxisChange}
						interactive={interactive}
					/>
				</Group>

				{/* Select / Start */}
				<Group {...groupProps("startSelect")}>
					<div className="flex gap-3">
						<Btn
							id="select"
							label="⊟"
							className={`${SHOULDER_BASE} text-base`}
							style={{ width: btnSm * 1.4, height: btnSm }}
							active={activeButtons.has("select")}
							onPress={handlePress}
							interactive={interactive}
						/>
						<Btn
							id="start"
							label="⊞"
							className={`${SHOULDER_BASE} text-base`}
							style={{ width: btnSm * 1.4, height: btnSm }}
							active={activeButtons.has("start")}
							onPress={handlePress}
							interactive={interactive}
						/>
					</div>
				</Group>

				{/* Face buttons: Y/A/X/B */}
				<Group {...groupProps("faceButtons")}>
					<div
						className="relative"
						style={{ width: btnFace * 2.8, height: btnFace * 2.8 }}
					>
						<Btn
							id="y"
							label="Y"
							className="bg-primary border-primary text-white"
							style={{
								width: btnFace,
								height: btnFace,
								position: "absolute",
								padding: "10px",
								top: 0,
								left: "50%",
								transform: "translateX(-50%)",
							}}
							active={activeButtons.has("y")}
							onPress={handlePress}
							interactive={interactive}
						/>
						<Btn
							id="a"
							label="A"
							className="bg-primary border-primary"
							style={{
								width: btnFace,
								height: btnFace,
								position: "absolute",
								padding: "10px",
								bottom: 0,
								left: "50%",
								transform: "translateX(-50%)",
							}}
							active={activeButtons.has("a")}
							onPress={handlePress}
							interactive={interactive}
						/>
						<Btn
							id="x"
							label="X"
							className="bg-primary border-primary"
							style={{
								width: btnFace,
								height: btnFace,
								padding: "10px",
								position: "absolute",
								top: "50%",
								left: 0,
								transform: "translateY(-50%)",
							}}
							active={activeButtons.has("x")}
							onPress={handlePress}
							interactive={interactive}
						/>
						<Btn
							id="b"
							label="B"
							className="bg-primary border-primary"
							style={{
								width: btnFace,
								height: btnFace,
								position: "absolute",
								top: "50%",
								right: 0,
								transform: "translateY(-50%)",
							}}
							active={activeButtons.has("b")}
							onPress={handlePress}
							interactive={interactive}
						/>
					</div>
				</Group>

				{/* Right stick */}
				<Group {...groupProps("rightStick")}>
					<AnalogStick
						idPrefix="rs"
						size={stickSz}
						active={activeButtons}
						onPress={handlePress}
						onAxisChange={onAxisChange}
						interactive={interactive}
					/>
				</Group>
			</div>
		</div>
	)
}
