"use client"
import { t } from "../../utils/i18n"
import type React from "react"
import { useRef, useState, useCallback, useEffect } from "react"
import { useFileShare } from "../../contexts/FileShareContext"
import {
	Upload,
	X,
	FolderOpen,
	File,
	FileText,
	FileImage,
	FileVideo,
	FileAudio,
	CheckCircle,
	AlertCircle,
	Loader2,
	Trash2,
	Download,
} from "lucide-react"

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function FileIcon({
	mimeType,
	size = 24,
}: {
	mimeType: string
	size?: number
}) {
	if (mimeType.startsWith("image/")) return <FileImage size={size} />
	if (mimeType.startsWith("video/")) return <FileVideo size={size} />
	if (mimeType.startsWith("audio/")) return <FileAudio size={size} />
	if (mimeType.startsWith("text/")) return <FileText size={size} />
	return <File size={size} />
}

function getToken(): string | null {
	if (typeof window === "undefined") return null
	return (
		new URLSearchParams(window.location.search).get("token") ||
		localStorage.getItem("rein_auth_token")
	)
}

interface QueueItem {
	id: string
	file: File
	status: "queued" | "uploading" | "done" | "error"
	progress: number
	error?: string
}

export function FileShareOverlay() {
	const { overlayOpen, setOverlayOpen, sharedFiles, uploadFile, deleteFile } =
		useFileShare()
	const [queue, setQueue] = useState<QueueItem[]>([])
	const [dragging, setDragging] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const dropZoneRef = useRef<HTMLElement>(null)

	useEffect(() => {
		if (!overlayOpen) setQueue([])
	}, [overlayOpen])

	// -------------------------------------------------------------------------
	// Drag-and-drop

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		setDragging(true)
	}, [])

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
			setDragging(false)
		}
	}, [])

	const enqueueFiles = useCallback((files: FileList | File[]) => {
		const arr = Array.from(files)
		const items: QueueItem[] = arr.map((file) => ({
			id: `${Date.now()}-${Math.random()}`,
			file,
			status: "queued",
			progress: 0,
		}))
		setQueue((prev) => [...prev, ...items])
	}, [])

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			setDragging(false)
			if (e.dataTransfer.files.length) enqueueFiles(e.dataTransfer.files)
		},
		[enqueueFiles],
	)

	const handleFileInput = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (e.target.files?.length) {
				enqueueFiles(e.target.files)
				e.target.value = ""
			}
		},
		[enqueueFiles],
	)

	// Uploading Files
	const uploadItem = useCallback(
		async (item: QueueItem) => {
			setQueue((prev) =>
				prev.map((q) => (q.id === item.id ? { ...q, status: "uploading" } : q)),
			)
			try {
				await uploadFile(item.file)
				setQueue((prev) =>
					prev.map((q) =>
						q.id === item.id ? { ...q, status: "done", progress: 100 } : q,
					),
				)
			} catch (err) {
				setQueue((prev) =>
					prev.map((q) =>
						q.id === item.id
							? { ...q, status: "error", error: String(err) }
							: q,
					),
				)
			}
		},
		[uploadFile],
	)

	useEffect(() => {
		const pending = queue.filter((q) => q.status === "queued")
		for (const item of pending) {
			uploadItem(item)
		}
	}, [queue, uploadItem])

	const handleDelete = useCallback(
		async (fileId: string) => {
			await deleteFile(fileId)
		},
		[deleteFile],
	)

	const handleDownload = useCallback((fileId: string, name: string) => {
		const token = getToken()
		const url = `/api/files/download?fileId=${encodeURIComponent(fileId)}${token ? `&token=${encodeURIComponent(token)}` : ""}`
		const a = document.createElement("a")
		a.href = url
		a.download = name
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
	}, [])

	if (!overlayOpen) return null

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			style={{
				backdropFilter: "blur(8px)",
				backgroundColor: "rgba(0,0,0,0.6)",
			}}
		>
			{/* Panel */}
			<div
				className="relative flex flex-col w-full max-w-lg mx-4 rounded-2xl overflow-hidden shadow-2xl"
				style={{
					background: "linear-gradient(145deg, hsl(var(--b1)), hsl(var(--b2)))",
					border: "1px solid hsl(var(--b3))",
					maxHeight: "90dvh",
				}}
			>
				{/* Header */}
				<div className="flex bg-base-100 items-center justify-between px-5 py-4 border-b">
					<div className="flex items-center gap-3">
						<p className="text-lg mt-0.5">Send Files</p>
					</div>
					<button
						type="button"
						id="file-share-overlay-close"
						aria-label={t("sendFile", "close")}
						className="btn btn-ghost btn-sm btn-circle"
						onClick={() => setOverlayOpen(false)}
					>
						<X size={18} />
					</button>
				</div>

				{/* Drop zone + file list */}
				<div className="flex-1 bg-base-300 overflow-y-auto p-4 flex flex-col gap-4">
					{/*
					  The drop zone is a <section> (landmark) so that the inner
					  "Browse Files" <button> is a valid, non-nested descendant.
					  Drag-and-drop events fire on the section; keyboard access
					  is provided by the inner button.
					*/}
					<section
						ref={dropZoneRef}
						aria-label="File drop zone"
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
						className="relative flex flex-col items-center justify-center gap-3 rounded-xl select-none transition-all duration-200 w-full"
						style={{
							minHeight: "160px",
							border: dragging
								? "2px dashed hsl(var(--p))"
								: "2px dashed hsl(var(--b3))",
							background: dragging ? "hsl(var(--p) / 0.08)" : "hsl(var(--b2))",
						}}
					>
						{/* Hidden file input */}
						<input
							ref={fileInputRef}
							type="file"
							multiple
							className="hidden"
							onChange={handleFileInput}
							id="file-share-file-input"
						/>

						{/* Upload icon */}
						<div
							className="flex items-center justify-center w-14 h-14 rounded-full transition-transform duration-200"
							style={{
								background: dragging
									? "linear-gradient(135deg, hsl(var(--p)), hsl(var(--s)))"
									: "hsl(var(--b3))",
								transform: dragging ? "scale(1.1)" : "scale(1)",
							}}
						>
							<Upload
								size={24}
								className={dragging ? "text-white" : "opacity-50"}
							/>
						</div>

						{/* Labels */}
						<div className="text-center pointer-events-none">
							<p className="font-medium text-sm">
								{dragging ? "Release to upload" : "Drag & drop files here"}
							</p>
							<p className="text-xs opacity-50 mt-0.5">
								or use the button below
							</p>
						</div>

						{/* Browse button — valid <button> inside a <div>, no nesting error */}
						<button
							type="button"
							id="file-share-browse-btn"
							className="btn btn-sm btn-primary gap-2"
							onClick={() => fileInputRef.current?.click()}
						>
							<FolderOpen size={14} />
							Browse Files
						</button>
					</section>

					{/* Upload queue */}
					{queue.length > 0 && (
						<div className="flex flex-col gap-2">
							<p className="text-xs font-semibold uppercase tracking-wider opacity-50">
								Your Files
							</p>
							{queue.map((item) => (
								<QueueRow
									key={item.id}
									item={item}
									onRemove={() =>
										setQueue((prev) => prev.filter((q) => q.id !== item.id))
									}
								/>
							))}
						</div>
					)}

					{/* Shared files list */}
					{sharedFiles.length > 0 && (
						<div className="flex flex-col max-h-60 gap-2">
							<p className="text-xs font-semibold uppercase tracking-wider opacity-50">
								Shared Files
							</p>
							{sharedFiles.map((file) => (
								<SharedFileRow
									key={file.fileId}
									file={file}
									onDownload={() => handleDownload(file.fileId, file.name)}
									onDelete={() => handleDelete(file.fileId)}
								/>
							))}
						</div>
					)}

					{sharedFiles.length === 0 && queue.length === 0 && (
						<p className="text-center text-xs opacity-40 py-2">
							No files shared yet
						</p>
					)}
				</div>
			</div>
		</div>
	)
}

function QueueRow({
	item,
	onRemove,
}: {
	item: QueueItem
	onRemove: () => void
}) {
	return (
		<div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
			<div className="opacity-60">
				<FileIcon mimeType={item.file.type} size={20} />
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium truncate">{item.file.name}</p>
				<p className="text-xs opacity-50">{formatBytes(item.file.size)}</p>
				{item.status === "uploading" && (
					<div
						className="mt-1.5 h-1 rounded-full overflow-hidden"
						style={{ background: "hsl(var(--b3))" }}
					>
						<div className="h-full rounded-full transition-all duration-300" />
					</div>
				)}
				{item.status === "error" && (
					<p className="text-xs text-error mt-0.5 truncate">{item.error}</p>
				)}
			</div>
			<div className="shrink-0">
				{item.status === "uploading" && (
					<Loader2 size={18} className="animate-spin opacity-60" />
				)}
				{item.status === "done" && (
					<CheckCircle size={18} className="text-primary" />
				)}
				{item.status === "error" && (
					<button
						type="button"
						aria-label={t("sendFile", "removeFile")}
						className="btn btn-ghost btn-xs btn-circle text-error"
						onClick={onRemove}
					>
						<AlertCircle size={16} />
					</button>
				)}
				{item.status === "queued" && (
					<button
						type="button"
						aria-label={t("sendFile", "removeFile")}
						className="btn btn-ghost btn-xs btn-circle opacity-50"
						onClick={onRemove}
					>
						<X size={16} />
					</button>
				)}
			</div>
		</div>
	)
}

function SharedFileRow({
	file,
	onDownload,
	onDelete,
}: {
	file: {
		fileId: string
		name: string
		size: number
		mimeType: string
		uploadedBy: string
	}
	onDownload: () => void
	onDelete: () => void
}) {
	return (
		<div
			className="flex items-center gap-3 rounded-xl px-3 py-2.5 group"
			style={{
				background: "hsl(var(--b2))",
				border: "1px solid hsl(var(--b3))",
			}}
		>
			<div className="opacity-60">
				<FileIcon mimeType={file.mimeType} size={20} />
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium truncate">{file.name}</p>
				<p className="text-xs opacity-50">
					{formatBytes(file.size)} · from {file.uploadedBy}
				</p>
			</div>
			<div className="flex items-center gap-1 shrink-0">
				<button
					type="button"
					id={`file-share-download-${file.fileId}`}
					className="btn btn-ghost btn-xs btn-circle"
					onClick={onDownload}
					title="Download"
					aria-label={t("sendFile", "download")}
				>
					<Download size={15} />
				</button>
				<button
					type="button"
					id={`file-share-delete-${file.fileId}`}
					className="btn btn-ghost btn-xs btn-circle text-error transition-opacity"
					onClick={onDelete}
					title="Delete"
					aria-label={t("sendFile", "delete")}
				>
					<Trash2 size={15} />
				</button>
			</div>
		</div>
	)
}
