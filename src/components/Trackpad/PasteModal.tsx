"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { ClipboardPaste, X } from "lucide-react"
import { t } from "@/utils/i18n"

interface PasteModalProps {
	isOpen: boolean
	onClose: () => void
	onSubmit: (text: string) => void
}

export const PasteModal: React.FC<PasteModalProps> = ({
	isOpen,
	onClose,
	onSubmit,
}) => {
	const [text, setText] = useState("")
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	useEffect(() => {
		if (isOpen) {
			setText("")
			// Focus textarea after render so mobile keyboard or paste popup is immediately ready
			const timer = setTimeout(() => {
				textareaRef.current?.focus()
			}, 50)
			return () => clearTimeout(timer)
		}
	}, [isOpen])

	if (!isOpen) return null

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			e.preventDefault()
			onClose()
		} else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
			e.preventDefault()
			onSubmit(text)
		}
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
			onPointerDown={(e) => e.stopPropagation()}
			onTouchStart={(e) => e.stopPropagation()}
			onTouchMove={(e) => e.stopPropagation()}
			onTouchEnd={(e) => e.stopPropagation()}
		>
			{/* Backdrop click handler */}
			<button
				type="button"
				className="absolute inset-0 w-full h-full cursor-default border-none bg-transparent"
				onClick={onClose}
				aria-label={t("controlBar", "pasteModalCancel")}
			/>

			{/* Modal Card */}
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="paste-modal-title"
				onKeyDown={handleKeyDown}
				className="relative z-10 flex flex-col w-full max-w-md bg-base-100 rounded-2xl border border-base-300 shadow-2xl overflow-hidden p-5 gap-4 animate-in zoom-in-95 duration-150"
			>
				{/* Header */}
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-center gap-3">
						<div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
							<ClipboardPaste size={22} />
						</div>
						<div>
							<h3
								id="paste-modal-title"
								className="text-base font-semibold text-base-content"
							>
								{t("controlBar", "pasteModalTitle")}
							</h3>
							<p className="text-xs text-base-content/70 mt-0.5">
								{t("controlBar", "pasteModalDesc")}
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="btn btn-ghost btn-xs btn-square rounded-full text-base-content/60 hover:text-base-content"
						aria-label={t("controlBar", "pasteModalCancel")}
					>
						<X size={18} />
					</button>
				</div>

				{/* Textarea */}
				<div className="flex flex-col gap-1.5">
					<textarea
						ref={textareaRef}
						value={text}
						onChange={(e) => setText(e.target.value)}
						placeholder={t("controlBar", "pasteModalPlaceholder")}
						className="textarea textarea-bordered w-full h-32 bg-base-200/60 focus:bg-base-200 focus:outline-none focus:border-primary text-sm transition-all rounded-xl p-3 resize-none leading-relaxed"
					/>
					<p className="text-[11px] text-base-content/60 px-0.5">
						💡 {t("controlBar", "pasteModalHint")}
					</p>
				</div>

				{/* Actions */}
				<div className="flex items-center justify-end gap-2 pt-1 border-t border-base-200">
					<button
						type="button"
						onClick={onClose}
						className="btn btn-ghost btn-sm rounded-lg"
					>
						{t("controlBar", "pasteModalCancel")}
					</button>
					<button
						type="button"
						onClick={() => onSubmit(text)}
						className="btn btn-primary btn-sm rounded-lg gap-2 shadow-sm"
					>
						<ClipboardPaste size={16} />
						{t("controlBar", "pasteModalSubmit")}
					</button>
				</div>
			</div>
		</div>
	)
}
