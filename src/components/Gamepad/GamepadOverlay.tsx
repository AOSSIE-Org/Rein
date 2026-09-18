"use client"

import type React from "react"
import { useEffect, useState, useRef } from "react"
import { t } from "../../utils/i18n"

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
	leftShoulder: { x: 30, y: 60, scale: 1 },
	rightShoulder: { x: 70, y: 60, scale: 1 },
	dpad: { x: 15, y: 50, scale: 1 },
	leftStick: { x: 15, y: 80, scale: 1 },
	startSelect: { x: 50, y: 90, scale: 1 },
	faceButtons: { x: 85, y: 50, scale: 1 },
	rightStick: { x: 85, y: 80, scale: 1 },
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
	activeButtons?: Set<GamepadButtonId>
	onButtonChange?: (id: GamepadButtonId, pressed: boolean) => void
	onAxisChange?: (axis: "ls" | "rs", ax: number, ay: number) => void
	preview?: boolean
	editable?: boolean
	selectedGroup?: LayoutGroup | null
	onSelectGroup?: (id: LayoutGroup) => void
	onDragGroup?: (id: LayoutGroup, x: number, y: number) => void
}

const SHOULDER_BASE =
	"bg-base-100/80 border-base-300 text-base-content backdrop-blur-md"

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
			aria-label={t("gamepad", "gamepadButtonAriaLabel", { label })}
			aria-pressed={active}
			className={`
				select-none touch-none flex items-center justify-center
				font-semibold leading-none
				border
				transition-all duration-75
				shadow-md
				${
					active
						? "scale-90 brightness-75 shadow-inner"
						: "hover:brightness-110"
				}
				${
					interactive
						? "cursor-pointer pointer-events-auto"
						: "cursor-default pointer-events-none"
				}
				${className}
			`}
			style={style}
			{...handlers}
		>
			{label}
		</button>
	)
}

interface DPadProps {
	size: number
	active: Set<GamepadButtonId>
	onPress: (id: GamepadButtonId, down: boolean) => void
	interactive: boolean
}

function DPad({ size, active, onPress, interactive }: DPadProps) {
	const arm = size * 0.34
	const center = size * 0.36

	const commonClass = `
		absolute
		${SHOULDER_BASE}
		border-base-content/10
		bg-base-200/90
		shadow-inner
	`

	const directions = [
		{
			id: "dpad-up" as const,
			label: "▲",
			style: {
				width: arm,
				height: arm,
				top: 0,
				left: "50%",
				transform: "translateX(-50%)",
				borderRadius: "6px 6px 3px 3px",
			},
		},
		{
			id: "dpad-down" as const,
			label: "▼",
			style: {
				width: arm,
				height: arm,
				bottom: 0,
				left: "50%",
				transform: "translateX(-50%)",
				borderRadius: "3px 3px 6px 6px",
			},
		},
		{
			id: "dpad-left" as const,
			label: "◀",
			style: {
				width: arm,
				height: arm,
				left: 0,
				top: "50%",
				transform: "translateY(-50%)",
				borderRadius: "6px 3px 3px 6px",
			},
		},
		{
			id: "dpad-right" as const,
			label: "▶",
			style: {
				width: arm,
				height: arm,
				right: 0,
				top: "50%",
				transform: "translateY(-50%)",
				borderRadius: "3px 6px 6px 3px",
			},
		},
	]

	return (
		<div
			className="relative"
			style={{
				width: size,
				height: size,
			}}
		>
			<div
				className="
					absolute
					bg-base-200/95
					border
					border-base-content/10
					shadow-inner
				"
				style={{
					width: center,
					height: center,
					top: "50%",
					left: "50%",
					transform: "translate(-50%, -50%)",
					borderRadius: 5,
				}}
			/>

			{directions.map(({ id, label, style }) => (
				<Btn
					key={id}
					id={id}
					label={label}
					active={active.has(id)}
					onPress={onPress}
					interactive={interactive}
					className={`
						${commonClass}
						text-[0.7em]
						text-base-content/70
					`}
					style={style}
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
	const stickPressPointerId = useRef<number | null>(null)
	const dragPointerId = useRef<number | null>(null)

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

		if (dragPointerId.current === null) {
			dragPointerId.current = e.pointerId
			isDragging.current = true
		}

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
			stickPressPointerId.current = e.pointerId
			onPress(idPrefix, true)
		}
	}

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (
			!interactive ||
			!isDragging.current ||
			dragPointerId.current !== e.pointerId ||
			!containerRef.current
		)
			return

		e.stopPropagation()

		const rect = containerRef.current.getBoundingClientRect()
		const cx = rect.left + rect.width / 2
		const cy = rect.top + rect.height / 2

		applyNub(e.clientX - cx, e.clientY - cy)
	}

	const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!interactive) return

		e.stopPropagation()

		if (dragPointerId.current === e.pointerId) {
			dragPointerId.current = null
			isDragging.current = false
			applyNub(0, 0, true)
		}

		// Release LS/RS button only for the pointer that pressed it
		if (stickPressPointerId.current === e.pointerId) {
			stickPressPointerId.current = null
			onPress(idPrefix, false)
		}
	}

	return (
		<div
			ref={containerRef}
			className="
			relative flex items-center justify-center
			select-none touch-none
		"
			style={{
				width: outer,
				height: outer,
			}}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
		>
			{/* Outer socket */}
			<div
				className="
				absolute inset-0
				rounded-full
				bg-base-200/80
				border
				border-base-content/15
				shadow-inner
			"
			/>

			{/* Inner socket */}
			<div
				className="
				absolute rounded-full
				bg-base-300/80
				border
				border-base-content/10
				shadow-inner
			"
				style={{
					width: outer * 0.72,
					height: outer * 0.72,
				}}
			/>

			{/* Stick */}
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
					className={`
					w-full h-full
					rounded-full
					border
					border-base-content/20
					bg-base-100
					shadow-[0_4px_10px_rgba(0,0,0,0.25),inset_0_2px_3px_rgba(255,255,255,0.08)]
					transition-[filter]
					${active.has(idPrefix) ? "brightness-75" : ""}
				`}
					style={{ pointerEvents: "none" }}
				>
					<div
						className="
					w-full h-full
					rounded-full
					border
					border-base-content/5
					flex items-center justify-center
				"
					>
						<div
							className="
						w-1/2 h-1/2
						rounded-full
						bg-base-content/5
					"
						/>
					</div>
				</div>
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
		if (rect.width <= 0 || rect.height <= 0) return
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
	const videoRectRef = useRef<HTMLDivElement | null>(null)
	const interactive = !preview && !editable && !!onButtonChange
	const [videoRect, setVideoRect] = useState({
		left: 0,
		top: 0,
		width: 0,
		height: 0,
	})

	useEffect(() => {
		const updateVideoRect = () => {
			const container = containerRef.current
			if (!container) return

			const video = preview
				? null
				: (document.getElementById("screenMirror") as HTMLVideoElement | null)

			if (!video) {
				const rect = container.getBoundingClientRect()
				setVideoRect({
					left: 0,
					top: 0,
					width: rect.width,
					height: rect.height,
				})
				return
			}

			const rect = container.getBoundingClientRect()
			const videoWidth = video.videoWidth
			const videoHeight = video.videoHeight

			// Until WebRTC provides the video's intrinsic dimensions,
			// use the entire container element.
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
				renderedHeight = rect.height
				renderedWidth = renderedHeight * videoAspect
			} else {
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

		const video = preview
			? null
			: (document.getElementById("screenMirror") as HTMLVideoElement | null)

		if (video) {
			video.addEventListener("loadedmetadata", update)
			video.addEventListener("resize", update)
		}

		const resizeObserver = new ResizeObserver(update)
		if (containerRef.current) {
			resizeObserver.observe(containerRef.current)
		}
		if (video) {
			resizeObserver.observe(video)
		}

		window.addEventListener("resize", update)

		return () => {
			if (video) {
				video.removeEventListener("loadedmetadata", update)
				video.removeEventListener("resize", update)
			}
			resizeObserver.disconnect()
			window.removeEventListener("resize", update)
		}
	}, [preview])

	const handlePress = (id: GamepadButtonId, pressed: boolean) => {
		if (interactive && onButtonChange) onButtonChange(id, pressed)
	}

	const baseSize =
		videoRect.width > 0 && videoRect.height > 0
			? Math.min(
					600,
					Math.max(
						200,
						Math.min(videoRect.width * 0.45, videoRect.height * 0.85),
					),
				)
			: 360

	const btnSm = baseSize * 0.075
	const btnFace = baseSize * 0.11
	const stickSz = baseSize * 0.3
	const dpadSz = baseSize * 0.3
	const shoulderSize = baseSize * 0.15

	const groupProps = (id: LayoutGroup) => ({
		id,
		placement: layout[id],
		editable,
		selected: selectedGroup === id,
		containerRef: videoRectRef,
		onSelect: onSelectGroup,
		onDrag: onDragGroup,
	})

	return (
		<div
			ref={containerRef}
			className="absolute flex justify-center items-center inset-0 pointer-events-none z-20"
		>
			<div
				ref={videoRectRef}
				className="absolute pointer-events-none"
				style={{
					left: `${videoRect.left}px`,
					top: `${videoRect.top}px`,
					width: `${videoRect.width}px`,
					height: `${videoRect.height}px`,
				}}
			>
				{/* Left shoulder: LT + LB */}
				{/* Left shoulder */}
				<Group {...groupProps("leftShoulder")}>
					<div className="flex flex-col items-center gap-3">
						<Btn
							id="lt"
							label={t("gamepad", "lt")}
							className={`
				${SHOULDER_BASE}
				rounded-full
				border-2
				font-bold
				text-sm
				shadow-lg
			`}
							style={{
								width: shoulderSize,
								height: shoulderSize,
							}}
							active={activeButtons.has("lt")}
							onPress={handlePress}
							interactive={interactive}
						/>

						<Btn
							id="lb"
							label={t("gamepad", "lb")}
							className={`
				${SHOULDER_BASE}
				rounded-full
				border-2
				font-bold
				text-sm
				shadow-lg
			`}
							style={{
								width: shoulderSize,
								height: shoulderSize,
							}}
							active={activeButtons.has("lb")}
							onPress={handlePress}
							interactive={interactive}
						/>
					</div>
				</Group>

				{/* Right shoulder */}
				<Group {...groupProps("rightShoulder")}>
					<div className="flex flex-col items-center gap-3">
						<Btn
							id="rt"
							label={t("gamepad", "rt")}
							className={`
				${SHOULDER_BASE}
				rounded-full
				border-2
				font-bold
				text-sm
				shadow-lg
			`}
							style={{
								width: shoulderSize,
								height: shoulderSize,
							}}
							active={activeButtons.has("rt")}
							onPress={handlePress}
							interactive={interactive}
						/>

						<Btn
							id="rb"
							label={t("gamepad", "rb")}
							className={`
				${SHOULDER_BASE}
				rounded-full
				border-2
				font-bold
				text-sm
				shadow-lg
			`}
							style={{
								width: shoulderSize,
								height: shoulderSize,
							}}
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
							label={t("gamepad", "select")}
							className={`
								${SHOULDER_BASE}
								px-7
								text-base
								rounded-xl
								border-primary
								shadow-md
							`}
							style={{
								width: btnSm * 1.4,
								height: btnSm,
							}}
							active={activeButtons.has("select")}
							onPress={handlePress}
							interactive={interactive}
						/>

						<Btn
							id="start"
							label={t("gamepad", "start")}
							className={`
								${SHOULDER_BASE}
								px-7
								text-base
								rounded-xl
								border-secondary
								shadow-md
							`}
							style={{
								width: btnSm * 1.4,
								height: btnSm,
							}}
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
							className="bg-primary rounded-full border-primary text-white"
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
							className="bg-primary rounded-full border-primary text-white"
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
							className="bg-primary rounded-full border-primary text-white"
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
							className="bg-primary rounded-full border-primary text-white"
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
