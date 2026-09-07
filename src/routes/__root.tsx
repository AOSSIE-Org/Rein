import {
	HeadContent,
	Link,
	Outlet,
	Scripts,
	createRootRoute,
} from "@tanstack/react-router"
import { useEffect } from "react"
import { APP_CONFIG, THEMES } from "../config"
import { getLocalStorageItem } from "../utils/safeLocalStorage"
import "../styles.css"
import {
	ConnectionProvider,
	useConnection,
} from "../contexts/ConnectionProvider"
import { DebugProvider } from "../contexts/DebugContext"
import { FileShareProvider, useFileShare } from "../contexts/FileShareContext"
import { FileShareOverlay } from "../components/FileTransfer/SendFileComponent"
import { IncomingFileNotifications } from "../components/FileTransfer/IncomingFileNotification"
import { FolderOpen, MousePointer2, SlidersHorizontal } from "lucide-react"

export const Route = createRootRoute({
	shellComponent: AppProviders,
	component: RootComponent,
	errorComponent: (props) => {
		return (
			<RootDocument>
				<div>Error: {props.error.message}</div>
			</RootDocument>
		)
	},
	notFoundComponent: () => <div>Not Found</div>,
})

function AppProviders({ children }: { children: React.ReactNode }) {
	return (
		<ConnectionProvider>
			<DebugProvider>
				<FileShareProvider>{children}</FileShareProvider>
			</DebugProvider>
		</ConnectionProvider>
	)
}

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
			{/* <TanStackRouterDevtools position="bottom-right" /> */}
		</RootDocument>
	)
}

function ThemeInit() {
	useEffect(() => {
		const saved = getLocalStorageItem(APP_CONFIG.THEME_STORAGE_KEY)
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
				<IncomingFileNotifications />
				<FileShareOverlay />
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
import { t } from "../utils/i18n"

function Navbar() {
	const navItems = [
		{
			to: "/trackpad",
			label: t("nav", "trackpad"),
			icon: MousePointer2,
			id: "nav-link-trackpad",
		},
		{
			to: "/settings",
			label: t("nav", "settings"),
			icon: SlidersHorizontal,
			id: "nav-link-settings",
		},
	]

	return (
		<div className="navbar bg-base-100 border-b border-base-300 min-h-12 h-12 z-50 px-4">
			<div className="flex-1">
				<Link to="/trackpad" className="btn btn-ghost text-xl normal-case">
					<img
						src="/app_icon/IconLine.png"
						height={32}
						width={32}
						alt="Rein logo"
					/>
					Rein
				</Link>
			</div>
			<nav className="flex items-center gap-1 bg-base-200/60 p-1 rounded-xl border border-base-300/50">
				<LatencyBadge />
				{navItems.map((item) => (
					<Link
						key={item.to}
						to={item.to}
						id={item.id}
						aria-label={item.label}
						className="btn btn-ghost btn-xs sm:btn-sm gap-1.5 font-medium rounded-lg text-base-content/70 hover:text-base-content hover:bg-base-200/80 transition-all duration-200"
						activeProps={{
							className:
								"btn-active bg-base-100 text-primary shadow-xs border border-base-300/80 font-semibold",
						}}
					>
						<item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
						<span className="hidden md:inline text-xs sm:text-sm">
							{item.label}
						</span>
					</Link>
				))}
				<SendFileButton />
			</nav>
		</div>
	)
}

function SendFileButton() {
	const { setOverlayOpen } = useFileShare()
	return (
		<button
			type="button"
			id="navbar-send-files-btn"
			className="btn btn-ghost btn-sm gap-1.5 relative"
			onClick={() => setOverlayOpen(true)}
			title={t("nav", "sendFile")}
			aria-label={t("nav", "sendFile")}
		>
			<FolderOpen size={18} />
		</button>
	)
}
