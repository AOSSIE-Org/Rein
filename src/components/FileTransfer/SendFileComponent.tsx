"use client"
import type React from "react"
import { useRef, useState, useCallback, useEffect } from "react"
import {
	useFileShare,
	type DirectoryItem,
} from "../../contexts/FileShareContext"
import {
	Upload,
	X,
	Folder,
	File,
	FileText,
	FileImage,
	FileVideo,
	FileAudio,
	Archive,
	Download,
	Loader2,
	RefreshCw,
	ChevronRight,
	Home,
	Undo2,
} from "lucide-react"

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B"
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function ItemIcon({ item, size = 20 }: { item: DirectoryItem; size?: number }) {
	if (item.isDir)
		return <Folder size={size} className="text-primary shrink-0" />
	const mime = item.mimeType
	if (mime.startsWith("image/"))
		return <FileImage size={size} className="text-accent shrink-0" />
	if (mime.startsWith("video/"))
		return <FileVideo size={size} className="text-secondary shrink-0" />
	if (mime.startsWith("audio/"))
		return <FileAudio size={size} className="text-warning shrink-0" />
	if (mime.startsWith("text/"))
		return <FileText size={size} className="text-info shrink-0" />
	if (mime.includes("archive") || mime.includes("zip"))
		return <Archive size={size} className="text-error shrink-0" />
	return <File size={size} className="opacity-60 shrink-0" />
}

export function FileShareOverlay() {
	const {
		overlayOpen,
		setOverlayOpen,
		currentPath,
		parentPath,
		directoryItems,
		selectedItem,
		setSelectedItem,
		isLoadingDir,
		fetchDirectory,
		downloadFileByPath,
		uploadFile,
	} = useFileShare()

	const [uploading, setUploading] = useState(false)
	const [dragging, setDragging] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const dropZoneRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!overlayOpen) setSelectedItem(null)
	}, [overlayOpen, setSelectedItem])

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		setDragging(true)
	}, [])

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
			setDragging(false)
		}
	}, [])

	const processFilesUpload = useCallback(
		async (files: FileList | File[]) => {
			setUploading(true)
			try {
				for (const file of Array.from(files)) {
					await uploadFile(file)
				}
			} catch (err) {
				console.error("Upload error:", err)
			} finally {
				setUploading(false)
			}
		},
		[uploadFile],
	)

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			setDragging(false)
			if (e.dataTransfer.files.length) {
				processFilesUpload(e.dataTransfer.files)
			}
		},
		[processFilesUpload],
	)

	const handleFileInput = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (e.target.files?.length) {
				processFilesUpload(e.target.files)
				e.target.value = ""
			}
		},
		[processFilesUpload],
	)

	if (!overlayOpen) return null

	const pathSegments = currentPath ? currentPath.split("/").filter(Boolean) : []

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			style={{
				backdropFilter: "blur(8px)",
				backgroundColor: "rgba(0,0,0,0.6)",
			}}
		>
			<input
				ref={fileInputRef}
				type="file"
				multiple
				className="hidden"
				onChange={handleFileInput}
				id="file-share-overlay-file-input"
			/>

			<section
				ref={dropZoneRef}
				aria-label="File explorer drop zone"
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				className="relative flex flex-col bg-secondary-content w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl transition-all duration-200"
				style={{
					border: dragging
						? "2px dashed hsl(var(--p))"
						: "1px solid hsl(var(--b3))",
					maxHeight: "85dvh",
					height: "600px",
				}}
			>
				{/* Top Header Bar */}
				<div className="flex bg-base-100 items-center justify-between px-5 py-3 border-b border-base-300">
					<div className="flex items-center gap-2">
						<span className="font-semibold text-base">File Explorer</span>
					</div>

					<div className="flex items-center gap-2">
						<button
							type="button"
							className="btn btn-sm btn-primary gap-1.5 rounded-lg"
							disabled={uploading}
							onClick={() => fileInputRef.current?.click()}
							title="Upload file to host"
						>
							{uploading ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<Upload size={16} />
							)}
							<span>Upload</span>
						</button>
						{parentPath && (
							<button
								type="button"
								className="btn btn-ghost btn-xs btn-circle shrink-0"
								onClick={() => fetchDirectory(parentPath)}
								title="Up one folder"
							>
								<Undo2 size={15} />
							</button>
						)}
						<button
							type="button"
							className="btn btn-ghost btn-sm btn-circle"
							onClick={() => fetchDirectory(currentPath)}
							title="Refresh directory"
						>
							<RefreshCw
								size={16}
								className={isLoadingDir ? "animate-spin" : ""}
							/>
						</button>

						<button
							type="button"
							id="file-share-overlay-close"
							className="btn btn-ghost btn-sm btn-circle"
							onClick={() => setOverlayOpen(false)}
							title="Close"
						>
							<X size={18} />
						</button>
					</div>
				</div>

				<div className="flex items-center gap-1.5 px-4 py-2.5 bg-base-200/50 border-b border-base-300 text-xs overflow-x-auto select-none">
					<button
						type="button"
						className="hover:text-primary flex items-center gap-1 shrink-0 opacity-70 font-medium"
						onClick={() => fetchDirectory("")}
					>
						<Home size={14} />
						<span>Root</span>
					</button>

					{pathSegments.map((segment, idx) => {
						const subPath = `/${pathSegments.slice(0, idx + 1).join("/")}`
						const isLast = idx === pathSegments.length - 1
						return (
							<div key={subPath} className="flex items-center gap-1 shrink-0">
								<ChevronRight size={12} className="opacity-40" />
								<button
									type="button"
									className={`hover:text-primary transition-colors ${
										isLast ? "font-bold text-primary" : "opacity-70 font-medium"
									}`}
									onClick={() => fetchDirectory(subPath)}
								>
									{segment}
								</button>
							</div>
						)
					})}
				</div>

				{/* Directory Content List / Grid View */}
				<div className="flex-1 bg-base-300/40 overflow-y-auto p-3">
					{isLoadingDir ? (
						<div className="flex flex-col items-center justify-center h-full gap-2 opacity-50">
							<Loader2 size={24} className="animate-spin text-primary" />
							<span className="text-xs font-medium">Loading folder...</span>
						</div>
					) : directoryItems.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full opacity-40 gap-2">
							<Folder size={36} />
							<p className="text-xs">Directory is empty</p>
						</div>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
							{directoryItems.map((item) => {
								const isSelected = selectedItem?.path === item.path
								return (
									<button
										key={item.path}
										type="button"
										className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all select-none ${
											isSelected
												? "border-primary bg-primary/15 shadow-sm"
												: "border-base-300 bg-base-100/70 hover:border-primary/50 hover:bg-base-100"
										}`}
										onClick={() => {
											if (item.isDir) {
												fetchDirectory(item.path)
											} else {
												setSelectedItem(item)
											}
										}}
									>
										<ItemIcon item={item} size={22} />
										<div className="flex-1 min-w-0">
											<p className="text-sm font-medium truncate">
												{item.name}
											</p>
											<p className="text-[11px] opacity-50">
												{item.isDir ? "Folder" : formatBytes(item.size)}
											</p>
										</div>
									</button>
								)
							})}
						</div>
					)}
				</div>

				{/* Bottom Bar */}
				{selectedItem && !selectedItem.isDir && (
					<div className="flex items-center justify-between px-5 py-3 bg-base-100 border-t border-base-300 shadow-lg">
						<div className="flex items-center gap-3 min-w-0">
							<ItemIcon item={selectedItem} size={24} />
							<div className="min-w-0">
								<p className="text-sm font-semibold truncate">
									{selectedItem.name}
								</p>
								<p className="text-xs opacity-50">
									{formatBytes(selectedItem.size)}
								</p>
							</div>
						</div>

						<div className="flex items-center gap-2 shrink-0">
							<button
								type="button"
								className="btn btn-sm btn-primary gap-1.5 rounded-lg shadow-sm"
								onClick={() =>
									downloadFileByPath(selectedItem.path, selectedItem.name)
								}
							>
								<Download size={16} />
								<span>Download</span>
							</button>

							<button
								type="button"
								className="btn btn-ghost btn-xs btn-circle"
								onClick={() => setSelectedItem(null)}
								title="Clear selection"
							>
								<X size={16} />
							</button>
						</div>
					</div>
				)}
			</section>
		</div>
	)
}
