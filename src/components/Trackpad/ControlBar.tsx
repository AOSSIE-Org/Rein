import { ModifierState } from "@/types";
import React from "react";

interface ControlBarProps {
	scrollMode: boolean;
	modifier: ModifierState;
	buffer: string;
	onToggleScroll: () => void;
	onLeftClick: () => void;
	onRightClick: () => void;
	onKeyboardToggle: () => void;
	onModifierToggle: () => void;
	onCopy?: () => void;
	onPaste?: () => void;
	keyboardOn: boolean
}

// SVG Icons
const CursorIcon = () => (
	<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
		<path d="M4 0l16 12.279-6.951 1.17 4.325 8.817-3.596 1.734-4.35-8.879-5.428 4.702z" />
	</svg>
);
const ScrollIcon = () => (
	<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
		<rect x="7" y="2" width="10" height="20" rx="5" />
		<line x1="12" y1="6" x2="12" y2="10" />
		<path d="M12 6l-2 2M12 6l2 2" />
	</svg>
);
const ClickLIcon = () => (
	<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
		<rect x="5" y="3" width="14" height="18" rx="4" />
		<line x1="12" y1="3" x2="12" y2="12" />
		<path d="M5 9h7" />
	</svg>
);
const ClickRIcon = () => (
	<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
		<rect x="5" y="3" width="14" height="18" rx="4" />
		<line x1="12" y1="3" x2="12" y2="12" />
		<path d="M12 9h7" />
	</svg>
);
const CopyIcon = () => (
	<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
		<rect x="9" y="9" width="13" height="13" rx="2" />
		<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
	</svg>
);
const PasteIcon = () => (
	<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
		<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
		<rect x="8" y="2" width="8" height="4" rx="1" />
		<line x1="12" y1="11" x2="12" y2="17" />
		<line x1="9" y1="14" x2="15" y2="14" />
	</svg>
);
const KeyboardIcon = () => (
	<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
		<rect x="2" y="6" width="20" height="12" rx="2" />
		<line x1="6" y1="10" x2="6" y2="10" strokeWidth="3" strokeLinecap="round" />
		<line x1="10" y1="10" x2="10" y2="10" strokeWidth="3" strokeLinecap="round" />
		<line x1="14" y1="10" x2="14" y2="10" strokeWidth="3" strokeLinecap="round" />
		<line x1="18" y1="10" x2="18" y2="10" strokeWidth="3" strokeLinecap="round" />
		<line x1="8" y1="14" x2="16" y2="14" strokeWidth="2.5" strokeLinecap="round" />
	</svg>
);

interface CtrlBtnProps {
	onClick: () => void;
	active?: boolean;
	activeColor?: string;
	label: string;
	icon: React.ReactNode;
	sublabel?: string;
}

const CtrlBtn: React.FC<CtrlBtnProps> = ({ onClick, active, activeColor, label, icon, sublabel }) => {
	const base = "flex flex-col items-center justify-center gap-[2px] rounded-lg transition-all duration-100 active:scale-95 select-none touch-none cursor-pointer";

	const boxShadow = active ? `0 0 12px ${activeColor ?? "#6366f1"}55, 0 2px 4px rgba(0,0,0,0.5)` : "0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)";

	const background = active ? `linear-gradient(145deg, ${activeColor ?? "#4f46e5"}, ${activeColor ?? "#4338ca"})` : "linear-gradient(145deg, #1e2b3c, #172030)";

	const border = active ? `1px solid ${activeColor ?? "#6366f1"}` : "1px solid rgba(255,255,255,0.08)";

	const color = active ? "#fff" : "#94a3b8";

	return (
		<button type="button" className={`${base} h-[clamp(44px,9vw,56px)] min-w-0 text-[clamp(7px,1.8vw,9px)] font-semibold tracking-[0.04em] uppercase px-[4px]`} style={{ boxShadow, background, border, color }}onPointerDown={(e) => { e.preventDefault(); onClick(); }}>{icon}
			<span className="mt-[1px] text-[clamp(6.5px,1.6vw,8.5px)]">{label}</span>
			{sublabel && <span className="text-[clamp(5.5px,1.3vw,7px)] opacity-70">{sublabel}</span>}
		</button>
	);
};

export const ControlBar: React.FC<ControlBarProps> = ({
	scrollMode,
	modifier,
	buffer,
	onToggleScroll,
	onLeftClick,
	onRightClick,
	onKeyboardToggle,
	onModifierToggle,
	onCopy,
	onPaste,
}) => {
	const modifierActive = modifier !== "Release";
	const modifierColor = modifier === "Active" && buffer.length > 0 ? "#10b981" : "#f59e0b";

	const getModLabel = () => {
		if (modifier === "Active") return buffer.length > 0 ? "Send" : "Release";
		if (modifier === "Hold") return "Release";
		return "Hold";
	};

	return (
		<div className="shrink-0 grid gap-[5px] px-[6px] py-[6px] grid-cols-7 bg-[linear-gradient(180deg,#0f1622_0%,#0b1019_100%)] border-t border-[rgba(255,255,255,0.07)] border-b border-[rgba(255,255,255,0.04)]">
			{/* Cursor / Scroll toggle */}
			<CtrlBtn onClick={onToggleScroll} active={scrollMode} activeColor="#3b82f6" label={scrollMode ? "Scroll" : "Cursor"} icon={scrollMode ? <ScrollIcon /> : <CursorIcon />}/>

			{/* Left Click */}
			<CtrlBtn
				onClick={onLeftClick}
				label="L-Click"
				icon={<ClickLIcon />}
			/>

			{/* Right Click */}
			<CtrlBtn
				onClick={onRightClick}
				label="R-Click"
				icon={<ClickRIcon />}
			/>

			{/* Copy */}
			<CtrlBtn
				onClick={onCopy ?? (() => { })}
				label="Copy"
				icon={<CopyIcon />}
			/>

			{/* Paste */}
			<CtrlBtn
				onClick={onPaste ?? (() => { })}
				label="Paste"
				icon={<PasteIcon />}
			/>

			{/* Modifier Hold */}
			<CtrlBtn
				onClick={onModifierToggle}
				active={modifierActive}
				activeColor={modifierColor}
				label={getModLabel()}
				sublabel={modifierActive ? "MOD" : undefined}
				icon={
					<span className="text-[clamp(10px,2.5vw,15px)] font-mono font-extrabold">
						{modifier === "Active" ? (buffer.length > 0 ? "⚡" : "◉") : modifier === "Hold" ? "⏻" : "⊕"}
					</span>
				}
			/>

			{/* Keyboard */}
			<CtrlBtn
				onClick={onKeyboardToggle}
				label="Keyboard"
				icon={<KeyboardIcon />}
			/>
		</div>
	);
};
