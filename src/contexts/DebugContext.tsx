import type React from "react"
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG"

export interface ClientLogEntry {
	id: string
	timestamp: string
	level: LogLevel
	message: string
	source: string
	details?: string
}

interface DebugContextType {
	clientLogs: ClientLogEntry[]
	clearClientLogs: () => void
}
const DebugContext = createContext<DebugContextType | null>(null)

export function useClientLogs(): DebugContextType {
	const ctx = useContext(DebugContext)
	if (!ctx) throw new Error("useClientLogs must be used inside DebugProvider")
	return ctx
}

function nowLabel(): string {
	const d = new Date()
	return `${d.getHours().toString().padStart(2, "0")}:${d
		.getMinutes()
		.toString()
		.padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`
}

function serialize(args: unknown[]): { message: string; details?: string } {
	const parts = args.map((a) => {
		if (typeof a === "string") return a
		if (a instanceof Error) return a.stack || a.message
		try {
			return JSON.stringify(a) ?? String(a)
		} catch {
			return String(a)
		}
	})
	const [message, ...rest] = parts
	return {
		message: message ?? "",
		details: rest.length > 0 ? rest.join(" ") : undefined,
	}
}

const MAX_LOGS = 500

export function DebugProvider({ children }: { children: React.ReactNode }) {
	const [clientLogs, setClientLogs] = useState<ClientLogEntry[]>([])
	const logIdRef = useRef(0)

	const addLog = useCallback(
		(level: LogLevel, args: unknown[], source = "console") => {
			const { message, details } = serialize(args)
			const entry: ClientLogEntry = {
				id: `cl-${++logIdRef.current}`,
				timestamp: nowLabel(),
				level,
				message,
				source,
				details,
			}
			setClientLogs((prev) => {
				const next = [...prev, entry]
				return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next
			})
		},
		[],
	)

	const clearClientLogs = useCallback(() => setClientLogs([]), [])
	useEffect(() => {
		const origLog = console.log.bind(console)
		const origWarn = console.warn.bind(console)
		const origError = console.error.bind(console)
		const origDebug = console.debug.bind(console)

		console.log = (...args: unknown[]) => {
			origLog(...args)
			addLog("INFO", args)
		}
		console.warn = (...args: unknown[]) => {
			origWarn(...args)
			addLog("WARN", args)
		}
		console.error = (...args: unknown[]) => {
			origError(...args)
			addLog("ERROR", args)
		}
		console.debug = (...args: unknown[]) => {
			origDebug(...args)
			addLog("DEBUG", args)
		}

		return () => {
			console.log = origLog
			console.warn = origWarn
			console.error = origError
			console.debug = origDebug
		}
	}, [addLog])
	useEffect(() => {
		const onError = (e: ErrorEvent) => {
			addLog(
				"ERROR",
				[
					`Unhandled error: ${e.message}`,
					e.filename ? `@ ${e.filename}:${e.lineno}` : "",
				],
				"window.onerror",
			)
		}
		const onUnhandledRejection = (e: PromiseRejectionEvent) => {
			addLog(
				"ERROR",
				[`Unhandled rejection: ${String(e.reason)}`],
				"unhandledrejection",
			)
		}

		window.addEventListener("error", onError)
		window.addEventListener("unhandledrejection", onUnhandledRejection)
		return () => {
			window.removeEventListener("error", onError)
			window.removeEventListener("unhandledrejection", onUnhandledRejection)
		}
	}, [addLog])

	const contextValue = useMemo(
		() => ({ clientLogs, clearClientLogs }),
		[clientLogs, clearClientLogs],
	)

	return (
		<DebugContext.Provider value={contextValue}>
			{children}
		</DebugContext.Provider>
	)
}
