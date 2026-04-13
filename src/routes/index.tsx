import { Link, createFileRoute } from "@tanstack/react-router"
import { MousePointer2, QrCode, Settings2, Wifi } from "lucide-react"
import { APP_CONFIG } from "../config"
import { useConnection } from "../contexts/ConnectionProvider"

export const Route = createFileRoute("/")({
	component: HomePage,
})

function HomePage() {
	const { status, latency, platform } = useConnection()

	const statusColor =
		status === "connected"
			? "text-success"
			: status === "connecting"
				? "text-warning"
				: "text-error"

	return (
		<div className="home-shell h-full overflow-hidden">
			<section className="relative flex min-h-full w-full items-center px-4 py-8 md:px-6 md:py-12">
				<div className="home-ambient pointer-events-none absolute inset-0 -z-10" />
				<div className="home-grid pointer-events-none absolute inset-0 -z-10 opacity-35" />

				<div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
					<div className="grid items-center gap-7 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
						<div className="home-enter-up max-w-3xl">
							<h1 className="text-balance text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
								Control your desktop
								<br />
								from anywhere
								<br />
								on your network.
							</h1>
							<p className="mt-5 max-w-2xl text-base-content/70 md:text-lg">
								{APP_CONFIG.SITE_NAME} turns your phone into a fast, precise desktop
								companion with fluid cursor control, keyboard input, and instant
								setup.
							</p>

							<div className="mt-8 flex flex-wrap gap-3">
								<Link
									to="/trackpad"
									className="glass-btn glass-btn-primary btn btn-wide"
								>
									<MousePointer2 size={16} />
									Launch Trackpad
								</Link>
								<Link
									to="/settings"
									className="glass-btn glass-btn-neutral btn btn-wide"
								>
									<Settings2 size={16} />
									Configure Device
								</Link>
							</div>

							<div className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
								<div className="glass-subcard rounded-xl p-3">
									<p className="font-semibold">Network Pairing</p>
									<p className="text-base-content/65">Same Wi-Fi, zero friction</p>
								</div>
								<div className="glass-subcard rounded-xl p-3">
									<p className="font-semibold">Responsive Input</p>
									<p className="text-base-content/65">Low latency feel</p>
								</div>
								<div className="glass-subcard rounded-xl p-3">
									<p className="font-semibold">QR Share</p>
									<p className="text-base-content/65">Connect in seconds</p>
								</div>
							</div>
						</div>

						<div className="home-enter-up-delay">
							<div className="glass-card card h-full">
								<div className="card-body gap-4">
									<div className="flex items-center justify-between">
										<h2 className="card-title text-2xl">Live Session</h2>
										<span className="badge badge-accent badge-sm">Realtime</span>
									</div>

									<div className="glass-subcard rounded-xl p-4">
										<p className="text-xs uppercase tracking-widest text-base-content/60">
											Connection
										</p>
										<p className={`mt-1 text-lg font-semibold capitalize ${statusColor}`}>
											{status}
										</p>
									</div>

									<div className="grid gap-3 sm:grid-cols-2">
										<div className="glass-subcard rounded-xl p-4">
											<p className="text-xs uppercase tracking-widest text-base-content/60">Latency</p>
											<p className="mt-1 text-lg font-semibold">
												{latency === null ? "-" : `${latency} ms`}
											</p>
										</div>
										<div className="glass-subcard rounded-xl p-4">
											<p className="text-xs uppercase tracking-widest text-base-content/60">Host OS</p>
											<p className="mt-1 text-lg font-semibold">{platform ?? "Unknown"}</p>
										</div>
									</div>

									<div className="glass-subcard rounded-xl p-4">
										<div className="flex items-center gap-2 text-sm font-medium">
											<QrCode size={16} className="text-primary" />
											Fast Pairing Flow
										</div>
										<div className="mt-3 space-y-2 text-sm text-base-content/70">
											<p>1. Open Settings and generate share QR</p>
											<p>2. Scan from phone browser</p>
											<p>3. Start controlling immediately</p>
										</div>
									</div>

									<p className="text-right text-xs text-base-content/60">{APP_CONFIG.SITE_NAME} v1.0.0</p>
								</div>
							</div>
						</div>
					</div>

					<div className="grid gap-3 md:grid-cols-3">
						<div className="glass-card glass-hover group rounded-2xl p-4">
							<div className="mb-2 inline-flex rounded-lg bg-primary/10 p-2 text-primary">
								<Wifi size={16} />
							</div>
							<p className="font-semibold">Stable Connection</p>
							<p className="mt-1 text-sm text-base-content/70">Automatic reconnect keeps your session resilient.</p>
						</div>
						<div className="glass-card glass-hover group rounded-2xl p-4">
							<div className="mb-2 inline-flex rounded-lg bg-secondary/10 p-2 text-secondary">
								<MousePointer2 size={16} />
							</div>
							<p className="font-semibold">Precision Touch</p>
							<p className="mt-1 text-sm text-base-content/70">Smooth movement with configurable sensitivity.</p>
						</div>
						<div className="glass-card glass-hover group rounded-2xl p-4">
							<div className="mb-2 inline-flex rounded-lg bg-accent/10 p-2 text-accent">
								<Settings2 size={16} />
							</div>
							<p className="font-semibold">Control Settings</p>
							<p className="mt-1 text-sm text-base-content/70">Customize theme, scroll behavior, and connection config.</p>
						</div>
					</div>
				</div>
			</section>
		</div>
	)
}
