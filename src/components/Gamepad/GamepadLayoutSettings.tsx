"use client"

import { useState, useEffect } from "react"
import {
	GamepadOverlay,
	DEFAULT_GAMEPAD_LAYOUT,
	type GamepadButtonLayout,
	type LayoutGroup,
} from "./GamepadOverlay"
import {
	getLocalStorageItem,
	setLocalStorageItem,
} from "../../utils/safeLocalStorage"
import { t } from "../../utils/i18n"

const STORAGE_KEY = "rein_gamepad_layout"

const getGroupLabels = (): Record<LayoutGroup, string> => ({
	leftShoulder: t("gamepad", "leftShoulder"),
	rightShoulder: t("gamepad", "rightShoulder"),
	dpad: t("gamepad", "dpad"),
	leftStick: t("gamepad", "leftStick"),
	rightStick: t("gamepad", "rightStick"),
	startSelect: t("gamepad", "startSelect"),
	faceButtons: t("gamepad", "faceButtons"),
})

function loadLayout(): GamepadButtonLayout {
	const raw = getLocalStorageItem(STORAGE_KEY)
	if (!raw) return structuredClone(DEFAULT_GAMEPAD_LAYOUT)
	try {
		const parsed = JSON.parse(raw) as Partial<GamepadButtonLayout>
		const merged = structuredClone(DEFAULT_GAMEPAD_LAYOUT)
		for (const key of Object.keys(DEFAULT_GAMEPAD_LAYOUT) as LayoutGroup[]) {
			const p = parsed[key]
			if (
				p &&
				typeof p.x === "number" &&
				typeof p.y === "number" &&
				typeof p.scale === "number"
			) {
				merged[key] = { x: p.x, y: p.y, scale: p.scale }
			}
		}
		return merged
	} catch {
		return structuredClone(DEFAULT_GAMEPAD_LAYOUT)
	}
}

export function saveLayout(layout: GamepadButtonLayout): void {
	setLocalStorageItem(STORAGE_KEY, JSON.stringify(layout))
}

export function useGamepadLayout(): [
	GamepadButtonLayout,
	(l: GamepadButtonLayout) => void,
] {
	// Always initialise with the defaults so server and client produce identical
	// HTML on first render — prevents hydration mismatch.
	const [layout, setLayoutState] = useState<GamepadButtonLayout>(() =>
		structuredClone(DEFAULT_GAMEPAD_LAYOUT),
	)

	// After mount (client-only), read localStorage and update if the user has
	// a saved layout.  This is a normal client-side re-render, not a hydration
	// conflict.
	useEffect(() => {
		const saved = loadLayout()
		setLayoutState(saved)
	}, [])

	const setLayout = (l: GamepadButtonLayout) => {
		setLayoutState(l)
		saveLayout(l)
	}

	return [layout, setLayout]
}

// ─── Preview + Controls ───────────────────────────────────────────────────────

export function GamepadLayoutSettings() {
	const [layout, setLayout] = useGamepadLayout()
	const [selected, setSelected] = useState<LayoutGroup>("faceButtons")
	const groupLabels = getGroupLabels()

	const updateGroup = (
		id: LayoutGroup,
		patch: Partial<{ x: number; y: number; scale: number }>,
	) => {
		setLayout({ ...layout, [id]: { ...layout[id], ...patch } })
	}

	const resetGroup = (id: LayoutGroup) => {
		setLayout({ ...layout, [id]: { ...DEFAULT_GAMEPAD_LAYOUT[id] } })
	}

	const resetAll = () => setLayout(structuredClone(DEFAULT_GAMEPAD_LAYOUT))

	const current = layout[selected]

	return (
		<div className="space-y-6">
			{/* Live, drag-to-position preview */}
			<div className="form-control w-full">
				<div className="label mb-1">
					<span className="label-text font-medium">
						{t("gamepad", "buttonLayoutPreview")}
					</span>
					<button
						type="button"
						className="btn btn-xs btn-ghost opacity-60"
						onClick={resetAll}
					>
						{t("gamepad", "resetAll")}
					</button>
				</div>

				<div
					id="gamepad-layout-preview"
					className="relative w-full rounded-xl overflow-hidden border border-base-300 bg-neutral"
					style={{ aspectRatio: "16/9" }}
				>
					<div className="absolute inset-0 flex items-center justify-center opacity-20">
						<span className="text-xs text-neutral-content font-mono uppercase tracking-widest">
							{t("gamepad", "screenMirrorPreview")}
						</span>
					</div>

					<GamepadOverlay
						layout={layout}
						preview
						editable
						selectedGroup={selected}
						onSelectGroup={setSelected}
						onDragGroup={(id, x, y) => updateGroup(id, { x, y })}
					/>
				</div>
				<p className="mt-1 text-xs opacity-50">
					{t("gamepad", "dragInstruction")}
				</p>
			</div>

			{/* Group picker */}
			<div className="form-control w-full">
				<div className="flex flex-wrap gap-2">
					{(Object.keys(groupLabels) as LayoutGroup[]).map((id) => (
						<button
							key={id}
							type="button"
							className={`btn btn-xs ${selected === id ? "btn-primary" : "btn-ghost border-base-300"}`}
							onClick={() => setSelected(id)}
						>
							{groupLabels[id]}
						</button>
					))}
				</div>
			</div>

			{/* Scale slider for the selected group */}
			<div className="form-control w-full">
				<label className="label" htmlFor="gamepad-scale-slider">
					<span className="label-text">
						{groupLabels[selected]} {t("gamepad", "scale")}
					</span>
					<span className="label-text-alt font-mono">
						{current.scale.toFixed(2)}×
					</span>
					<button
						type="button"
						className="btn btn-xs btn-ghost opacity-60"
						onClick={() => resetGroup(selected)}
					>
						{t("gamepad", "reset")}
					</button>
				</label>
				<input
					id="gamepad-scale-slider"
					type="range"
					min="0.5"
					max="2.0"
					step="0.05"
					value={current.scale}
					onChange={(e) =>
						updateGroup(selected, { scale: Number.parseFloat(e.target.value) })
					}
					className="range range-primary range-sm w-full"
				/>
				<div className="mt-1 flex w-full justify-between px-2 text-xs opacity-50">
					<span>{t("gamepad", "small")}</span>
					<span>{t("gamepad", "defaultSize")}</span>
					<span>{t("gamepad", "large")}</span>
				</div>
			</div>

			{/* Numeric position (fine control, syncs with drag) */}
			<div className="grid grid-cols-2 gap-4">
				<div className="form-control w-full">
					<label className="label" htmlFor="gamepad-offset-x-slider">
						<span className="label-text">{t("gamepad", "xPosition")}</span>
						<span className="label-text-alt font-mono">
							{current.x.toFixed(1)}%
						</span>
					</label>
					<input
						id="gamepad-offset-x-slider"
						type="range"
						min="0"
						max="100"
						step="0.5"
						value={current.x}
						onChange={(e) =>
							updateGroup(selected, { x: Number.parseFloat(e.target.value) })
						}
						className="range range-secondary range-sm w-full"
					/>
				</div>
				<div className="form-control w-full">
					<label className="label" htmlFor="gamepad-offset-y-slider">
						<span className="label-text">{t("gamepad", "yPosition")}</span>
						<span className="label-text-alt font-mono">
							{current.y.toFixed(1)}%
						</span>
					</label>
					<input
						id="gamepad-offset-y-slider"
						type="range"
						min="0"
						max="100"
						step="0.5"
						value={current.y}
						onChange={(e) =>
							updateGroup(selected, { y: Number.parseFloat(e.target.value) })
						}
						className="range range-accent range-sm w-full"
					/>
				</div>
			</div>
		</div>
	)
}
