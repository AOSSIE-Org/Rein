import {
	HeadContent,
	Link,
	Outlet,
	Scripts,
	createRootRoute,
} from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { APP_CONFIG, THEMES, NAV_LABELS } from "../config"
import "../styles.css"
import {
	ConnectionProvider,
	useConnection,
} from "../contexts/ConnectionProvider"
import { useCaptureProvider } from "../hooks/useCaptureProvider"

export const Route = createRootRoute({
	component: AppWithConnection,
	errorComponent: (props) => {
		return (
			<RootDocument>
				<div>Error: {props.error.message}</div>
			</RootDocument>
		)
	},
	notFoundComponent: () => <div>Not Found</div>,
})

function AppWithConnection() {
	return (
		<ConnectionProvider>
			<RootComponent />
		</ConnectionProvider>
	)
}

function RootComponent() {
	return (
		<RootDocument>
			<DesktopCaptureProvider />
			<Outlet />
			{/* <TanStackRouterDevtools position="bottom-right" /> */}
		</RootDocument>
	)
}

function DesktopCaptureProvider() {
	const { wsRef, status } = useConnection()
	const { startSharing } = useCaptureProvider(wsRef)
	const hasStartedRef = useRef(false)

	useEffect(() => {
		if (status !== "connected" || hasStartedRef.current) return

		// Mobile detection: avoid auto-start on mobile
		const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
		const canShare = !!navigator.mediaDevices?.getDisplayMedia

		if (!isMobile && canShare) {
			hasStartedRef.current = true
			startSharing()
		}
	}, [status, startSharing])

	return null
}

function ThemeInit() {
	useEffect(() => {
		if (typeof localStorage === "undefined") return
		const saved = localStorage.getItem(APP_CONFIG.THEME_STORAGE_KEY)
		const theme =
			saved === THEMES.LIGHT || saved === THEMES.DARK ? saved : THEMES.DEFAULT
		document.documentElement.setAttribute("data-theme", theme)
	}, [])
	return null
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
				<meta charSet="utf-8" />
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, interactive-widget=resizes-content"
				/>
				<title>Rein Remote</title>
				<link rel="icon" type="image/svg+xml" href="/app_icon/Icon.svg" />
				<link rel="manifest" href="/manifest.json" />
			</head>
			<body className="bg-base-200 text-base-content overflow-hidden overscroll-none">
				<ThemeInit />
				<div className="flex flex-col h-[100dvh]">
					<Navbar />
					<main className="flex-1 overflow-hidden relative">{children}</main>
				</div>
				<Scripts />
			</body>
		</html>
	)
}

function LatencyBadge() {
	const { latency } = useConnection()
	if (latency === null) return null

	const color =
		latency < 50
			? "text-green-400"
			: latency < 150
				? "text-yellow-400"
				: "text-red-400"

	return (
		<div className={`flex items-center gap-1.5 px-2 ${color}`}>
			<div className="w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_8px_rgba(0,0,0,0.3)]" />
			<span className="text-[11px] font-mono font-medium whitespace-nowrap">
				{latency}ms
			</span>
		</div>
	)
}

function Navbar() {
	return (
		<div className="glass-navbar navbar min-h-16 h-16 z-50 px-4 md:px-6">
			<div className="flex-1">
				<Link
					to="/trackpad"
					className="glass-btn glass-btn-neutral btn btn-sm md:btn-md text-xl font-semibold normal-case rounded-xl"
				>
					<img
						src="/app_icon/IconLine.png"
						height={32}
						width={32}
						alt="Rein logo"
					/>
					Rein
				</Link>
			</div>
			<div className="flex-none flex items-center gap-2 md:gap-3">
				<LatencyBadge />
				<Link
					to="/"
					className="glass-btn glass-btn-neutral btn btn-sm rounded-xl"
					activeProps={{
						className: "glass-btn glass-btn-primary btn btn-sm rounded-xl",
					}}
				>
					{NAV_LABELS.HOME}
				</Link>
				<Link
					to="/trackpad"
					className="glass-btn glass-btn-neutral btn btn-sm rounded-xl"
					activeProps={{
						className: "glass-btn glass-btn-primary btn btn-sm rounded-xl",
					}}
				>
					{NAV_LABELS.TRACKPAD}
				</Link>
				<Link
					to="/settings"
					className="glass-btn glass-btn-neutral btn btn-sm rounded-xl"
					activeProps={{
						className: "glass-btn glass-btn-primary btn btn-sm rounded-xl",
					}}
				>
					{NAV_LABELS.SETTINGS}
				</Link>
			</div>
		</div>
	)
}
