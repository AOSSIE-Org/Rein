import React from "react";

interface BufferBarProps {
	bufferText: string;
}

export const BufferBar: React.FC<BufferBarProps> = ({ bufferText }) => {
	if (!bufferText) return null;

	return (
		<div className="shrink-0 flex items-center gap-2 px-3 py-[5px] overflow-x-auto bg-linear-90 from-[`#1a1040`] to-[`#0f1a2e`] border-t border-t-[rgba(139,92,246,0.3)] border-b border-b-[rgba(139,92,246,0.15)]">
			<span className="text-[10px] font-mono text-[`#a78bfa`] font-bold tracking-[0.08em] uppercase opacity-70 whitespace-nowrap">
				COMBO
			</span>
			<div className="flex items-center gap-[5px]">
				{bufferText.split(" + ").map((key, i) => (
					<span key={i} className="bg-[rgba(139,92,246,0.2)] border border-[rgba(139,92,246,0.5)] rounded-[5px] px-[7px] py-[2px] text-[11px] font-mono font-bold text-[#c4b5fd] tracking-[0.05em] uppercase shadow-[0_0_6px_rgba(139,92,246,0.3)]">
						{key}
					</span>
				))}
			</div>
		</div>
	);
};
