import React from "react";
import { KeyGrid } from "./KeyGrid";

const KEYS = [
	{ label: "Esc", key: "esc" },
	{ label: "Tab", key: "tab" },
	{ label: "Ctrl", key: "ctrl" },
	{ label: "Alt", key: "alt" },
	{ label: "↑", key: "arrowup" },
	{ label: "PrtSc", key: "printscreen" },
	{ label: "Shift", key: "shift" },
	{ label: "Meta", key: "meta" },
	{ label: "Del", key: "delete" },
	{ label: "←", key: "arrowleft" },
	{ label: "↓", key: "arrowdown" },
	{ label: "→", key: "arrowright" },
];

interface ExtraKeysProps {
	sendKey: (key: string) => void;
}

export const ExtraKeys: React.FC<ExtraKeysProps> = ({ sendKey }) => (
	<KeyGrid
		keys={KEYS}
		sendKey={sendKey}
		className="bg-base-300 grid-rows-2 h-full"
		buttonClass="btn btn-neutral min-w-0 h-full"
	/>
);
