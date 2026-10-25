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
			const timer = setTimeout(() => {
				textareaRef.current?.focus()
			}, 50)
			return () => clearTimeout(timer)
		}
	}, [isOpen])

	if (!isOpen) return null

	const handleSubmit = (e?: React.FormEvent) => {
		e?.preventDefault()
		onSubmit(text)
	}

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
			e.preventDefault()
			handleSubmit()
		} else if (e.key === "Escape") {
			e.preventDefault()
			onClose()
		}
	}

	return (
		<dialog
			className="modal modal-open z-50"
			open
			aria-labelledby="paste-modal-title"
		>
			<div className="modal-box bg-base-100 border border-base-300 shadow-2xl max-w-md w-full p-5">
				<div className="flex items-center justify-between pb-3 border-b border-base-300">
					<div
						className="flex items-center gap-2 text-base-content font-semibold text-base"
						id="paste-modal-title"
					>
						<ClipboardPaste size={20} className="text-primary" />
						<span>{t("controlBar", "pasteModalTitle")}</span>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="btn btn-ghost btn-sm btn-circle text-base-content/70 hover:text-base-content"
						aria-label={t("controlBar", "pasteModalCancel")}
					>
						<X size={18} />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="py-4 space-y-3">
					<label
						htmlFor="clipboard-paste-input"
						className="block text-sm text-base-content/80"
					>
						{t("controlBar", "pasteModalDescription")}
					</label>
					<textarea
						id="clipboard-paste-input"
						ref={textareaRef}
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={t("controlBar", "pasteModalPlaceholder")}
						className="textarea textarea-bordered w-full h-28 bg-base-200 text-base-content placeholder:text-base-content/40 resize-none focus:outline-primary font-mono text-base"
						autoCapitalize="off"
						autoComplete="off"
						spellCheck={false}
					/>
					<div className="modal-action flex justify-end gap-2 pt-2 border-t border-base-300 mt-0">
						<button
							type="button"
							onClick={onClose}
							className="btn btn-ghost btn-sm"
						>
							{t("controlBar", "pasteModalCancel")}
						</button>
						<button type="submit" className="btn btn-primary btn-sm gap-1.5">
							<ClipboardPaste size={16} />
							{t("controlBar", "pasteModalSubmit")}
						</button>
					</div>
				</form>
			</div>
			<form
				method="dialog"
				className="modal-backdrop bg-black/60 backdrop-blur-xs"
			>
				<button type="button" onClick={onClose}>
					close
				</button>
			</form>
		</dialog>
	)
}
