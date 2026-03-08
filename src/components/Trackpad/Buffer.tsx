"use client"
import type React from "react"
import { Layers } from "lucide-react"

const TEXTS = {
	HOLD: "Hold",
}

interface BufferBarProps {
	bufferText: string
}

export const BufferBar: React.FC<BufferBarProps> = ({ bufferText }) => {
	return (
		<div className="absolute top-4 left-4 z-50 flex items-center gap-2 px-3 py-1.5 bg-neutral-900/40 backdrop-blur-md border border-white/10 rounded-full shadow-2xl animate-in fade-in slide-in-from-top-2 duration-300">
			<div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary animate-pulse">
				<Layers size={12} strokeWidth={3} />
			</div>
			<div className="flex items-center gap-1.5">
				<span className="text-[10px] font-black uppercase tracking-widest text-primary/80">
					{TEXTS.HOLD}
				</span>
				<div className="w-[1px] h-3 bg-white/10" />
				<span className="text-sm font-medium text-white/90 font-mono">
					{bufferText}
				</span>
			</div>
		</div>
	)
}
