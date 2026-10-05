"use client"

import type React from "react"
import {
	createContext,
	useContext,
	useState,
	useCallback,
	useEffect,
	useRef,
} from "react"
import { getLocalStorageItem } from "../utils/safeLocalStorage"

export interface SharedFileInfo {
	fileId: string
	name: string
	size: number
	mimeType: string
	uploadedAt: number
	uploadedBy: string
}

export interface DirectoryItem {
	name: string
	path: string
	isDir: boolean
	size: number
	mimeType: string
	modifiedAt: number
}

interface IncomingNotification extends SharedFileInfo {
	decision: "pending" | "accepted" | "rejected"
}

interface FileShareContextType {
	/** Files known to this client (host or remote) */
	sharedFiles: SharedFileInfo[]
	/** Incoming file notifications awaiting accept/reject */
	notifications: IncomingNotification[]
	/** Upload a file; returns the fileId or throws */
	uploadFile: (file: File) => Promise<string>
	/** Accept (download) an incoming file */
	acceptFile: (fileId: string) => void
	/** Reject (dismiss) an incoming file notification */
	rejectFile: (fileId: string) => void
	/** Delete a file from the shared store */
	deleteFile: (fileId: string) => Promise<void>
	/** Whether the send-file overlay is open */
	overlayOpen: boolean
	setOverlayOpen: (open: boolean) => void
	/** Upload progress per fileId (0–100) */
	uploadProgress: Record<string, number>
	/** Remote directory explorer state & handlers */
	currentPath: string
	parentPath: string | null
	directoryItems: DirectoryItem[]
	selectedItem: DirectoryItem | null
	setSelectedItem: (item: DirectoryItem | null) => void
	isLoadingDir: boolean
	fetchDirectory: (dirPath?: string) => Promise<void>
	downloadFileByPath: (filePath: string, name: string) => void
}

const FileShareContext = createContext<FileShareContextType | null>(null)

export const useFileShare = () => {
	const ctx = useContext(FileShareContext)
	if (!ctx) throw new Error("useFileShare must be inside FileShareProvider")
	return ctx
}

function getToken(): string | null {
	if (typeof window === "undefined") return null
	return (
		new URLSearchParams(window.location.search).get("token") ||
		getLocalStorageItem("rein_auth_token")
	)
}

function authQuery(): string {
	const token = getToken()
	return token ? `?token=${encodeURIComponent(token)}` : ""
}

export function FileShareProvider({ children }: { children: React.ReactNode }) {
	const [sharedFiles, setSharedFiles] = useState<SharedFileInfo[]>([])
	const [notifications, setNotifications] = useState<IncomingNotification[]>([])
	const [overlayOpen, setOverlayOpen] = useState(false)
	const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
		{},
	)
	const [currentPath, setCurrentPath] = useState<string>("")
	const [parentPath, setParentPath] = useState<string | null>(null)
	const [directoryItems, setDirectoryItems] = useState<DirectoryItem[]>([])
	const [selectedItem, setSelectedItem] = useState<DirectoryItem | null>(null)
	const [isLoadingDir, setIsLoadingDir] = useState<boolean>(false)

	const esRef = useRef<EventSource | null>(null)
	const ownUploadIds = useRef<Set<string>>(new Set())

	const fetchDirectory = useCallback(async (dirPath?: string) => {
		setIsLoadingDir(true)
		setSelectedItem(null)
		try {
			const token = getToken()
			const url = `/api/files/browse${dirPath ? `?path=${encodeURIComponent(dirPath)}` : ""}${token ? `${dirPath ? "&" : "?"}token=${encodeURIComponent(token)}` : ""}`
			const res = await fetch(url, {
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			})
			const data = (await res.json()) as {
				currentPath: string
				parentPath: string | null
				items: DirectoryItem[]
			}
			if (data.currentPath) {
				setCurrentPath(data.currentPath)
				setParentPath(data.parentPath)
				setDirectoryItems(data.items ?? [])
			}
		} catch (e) {
			console.error("Failed to browse directory:", e)
		} finally {
			setIsLoadingDir(false)
		}
	}, [])

	useEffect(() => {
		if (overlayOpen) {
			fetchDirectory(currentPath || undefined)
		}
	}, [overlayOpen, currentPath, fetchDirectory])

	useEffect(() => {
		const token = getToken()
		const sseUrl = `/api/files/events${token ? `?token=${encodeURIComponent(token)}` : ""}`
		const es = new EventSource(sseUrl)
		esRef.current = es

		es.onmessage = (ev) => {
			try {
				const msg = JSON.parse(ev.data) as {
					type: string
					fileId?: string
					name?: string
					size?: number
					mimeType?: string
					uploadedAt?: number
					uploadedBy?: string
				}

				if (msg.type === "incoming-file" && msg.fileId) {
					const info: SharedFileInfo = {
						fileId: msg.fileId,
						name: msg.name ?? "file",
						size: msg.size ?? 0,
						mimeType: msg.mimeType ?? "application/octet-stream",
						uploadedAt: msg.uploadedAt ?? Date.now(),
						uploadedBy: msg.uploadedBy ?? "unknown",
					}
					setSharedFiles((prev) => {
						if (prev.some((f) => f.fileId === info.fileId)) return prev
						return [info, ...prev]
					})
					if (!ownUploadIds.current.has(info.fileId)) {
						setNotifications((prev) => {
							if (prev.some((n) => n.fileId === info.fileId)) return prev
							return [{ ...info, decision: "pending" }, ...prev]
						})
					}
					// Refresh directory list if overlay open
					fetchDirectory(currentPath || undefined)
				} else if (msg.type === "file-deleted" && msg.fileId) {
					setSharedFiles((prev) => prev.filter((f) => f.fileId !== msg.fileId))
					setNotifications((prev) =>
						prev.filter((n) => n.fileId !== msg.fileId),
					)
				}
			} catch {}
		}

		es.onerror = () => {}

		return () => {
			es.close()
		}
	}, [currentPath, fetchDirectory])

	const uploadFile = useCallback(
		async (file: File): Promise<string> => {
			const tempId = `upload-${Date.now()}`
			setUploadProgress((p) => ({ ...p, [tempId]: 0 }))

			const formData = new FormData()
			formData.append("file", file)

			const token = getToken()

			return new Promise<string>((resolve, reject) => {
				const xhr = new XMLHttpRequest()
				xhr.open("POST", `/api/files/upload${authQuery()}`)
				if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`)

				xhr.upload.onprogress = (e) => {
					if (e.lengthComputable) {
						const pct = Math.round((e.loaded / e.total) * 100)
						setUploadProgress((p) => ({ ...p, [tempId]: pct }))
					}
				}

				xhr.onload = () => {
					setUploadProgress((p) => {
						const next = { ...p }
						delete next[tempId]
						return next
					})
					if (xhr.status === 200) {
						const resp = JSON.parse(xhr.responseText) as { fileId?: string }
						const realId = resp.fileId ?? tempId
						ownUploadIds.current.add(realId)
						fetchDirectory(currentPath || undefined)
						resolve(realId)
					} else {
						reject(new Error(`Upload failed: ${xhr.status}`))
					}
				}

				xhr.onerror = () => {
					setUploadProgress((p) => {
						const next = { ...p }
						delete next[tempId]
						return next
					})
					reject(new Error("Network error during upload"))
				}

				xhr.send(formData)
			})
		},
		[currentPath, fetchDirectory],
	)

	const downloadFileByPath = useCallback((filePath: string, name: string) => {
		const token = getToken()
		const url = `/api/files/download?path=${encodeURIComponent(filePath)}${token ? `&token=${encodeURIComponent(token)}` : ""}`
		const a = document.createElement("a")
		a.href = url
		a.download = name
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
	}, [])

	const acceptFile = useCallback((fileId: string) => {
		setNotifications((prev) =>
			prev.map((n) =>
				n.fileId === fileId ? { ...n, decision: "accepted" } : n,
			),
		)
		const token = getToken()
		const url = `/api/files/download?fileId=${encodeURIComponent(fileId)}${token ? `&token=${encodeURIComponent(token)}` : ""}`
		const a = document.createElement("a")
		a.href = url
		a.download = ""
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		setTimeout(() => {
			setNotifications((prev) => prev.filter((n) => n.fileId !== fileId))
		}, 2000)
	}, [])

	const rejectFile = useCallback((fileId: string) => {
		setNotifications((prev) =>
			prev.map((n) =>
				n.fileId === fileId ? { ...n, decision: "rejected" } : n,
			),
		)
		setTimeout(() => {
			setNotifications((prev) => prev.filter((n) => n.fileId !== fileId))
		}, 400)
	}, [])

	const deleteFile = useCallback(async (fileId: string) => {
		const token = getToken()
		await fetch(
			`/api/files?fileId=${encodeURIComponent(fileId)}${token ? `&token=${encodeURIComponent(token)}` : ""}`,
			{
				method: "DELETE",
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			},
		)
	}, [])

	return (
		<FileShareContext.Provider
			value={{
				sharedFiles,
				notifications,
				uploadFile,
				acceptFile,
				rejectFile,
				deleteFile,
				overlayOpen,
				setOverlayOpen,
				uploadProgress,
				currentPath,
				parentPath,
				directoryItems,
				selectedItem,
				setSelectedItem,
				isLoadingDir,
				fetchDirectory,
				downloadFileByPath,
			}}
		>
			{children}
		</FileShareContext.Provider>
	)
}
