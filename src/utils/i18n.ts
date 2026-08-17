/**
 * Lightweight internationalization resource layer.
 */

export const i18n = {
	en: {
		settings: {
			copied: "Copied to Clipboard!",
			appVersion: "Rein Remote v{version}",
			copyFailed:
				"Could not copy the link automatically. Please copy it manually.",
		},
		screenMirror: {
			ariaLabel: "Remote desktop screen share",
			connecting: "Connecting to host...",
			disconnected: "Disconnected from host",
			connectedButNoVideo: "Establishing stream...",
			establishingSecure: "Establishing secure connection",
			settingUpScreen: "Setting up screen sharing",
			checkNetwork: "Attempting to connect to the host.",
			establishingConnection: "Establishing Connection",
			negotiatingWebRtc: "Negotiating WebRTC session, please wait\u2026",
		},
		errorComponent: {
			unknownError: "Unknown Error",
			unexpectedNetworkError: "An unexpected network error occurred.",
			connectionFailedTitle: "Connection Failed",
			connectionFailedBody: "Unable to establish WebRTC stream connection.",
		},
		server: {
			welcomeTitle: "Welcome to Rein",
			localLabel: "Local",
			scanQr: "Scan QR code to connect the client:",
			networkLabel: "Network",
			remoteLabel: "Remote",
			debugLabel: "Debug",
			settingsLabel: "Settings",
			readyLine: "Listening for connections",
			statusLabel: "Status",
			runningLabel: "Running",
			portLabel: "Port",
		},
		debug: {
			gstreamer: "GStreamer",
			activeSessions: "Active Sessions",
			viewersSse: "Viewers (SSE)",
			inputChannels: "Input Channels",
			statusStopped: "stopped",
			statusStarting: "starting",
			statusRunning: "running",
			statusError: "error",
			network: "Network",
			allSessions: "all sessions",
			latency: "Latency",
			latencyMs: "{ms} ms",
			peakMs: "peak {ms} ms",
			videoRecv: "Video Recv",
			kbpsValue: "{val} KB/s",
			peakKbps: "peak {val} KB/s",
			inputSent: "Input Sent",
			clientSessions: "Client Sessions",
			noActiveSessions: "No active sessions",
			sessionConnected: "connected",
			sessionAnswered: "answered",
			sessionOffering: "offering",
			wsPeers: "WS peers",
			inputDc: "Input DC",
			dcOpen: "open",
			dcNone: "none",
			logConsole: "Log Console",
			serverTab: "Server ({count})",
			clientTab: "Client ({count})",
			filterPlaceholder: "Filter",
			filterAll: "ALL",
			filterInfo: "INFO",
			filterWarn: "WARN",
			filterError: "ERROR",
			clear: "Clear",
			noLogRecords: "No log records for the current filter.",
			copied: "Copied!",
			secondsAgo: "{s}s ago",
			minutesAgo: "{m}m ago",
			hoursAgo: "{h}h ago",
		},
		screenShareConsent: {
			title: "Allow Screen Sharing?",
			description:
				"This device wants to view and control the host's screen. Only allow this if you trust the source.",
			allow: "Allow",
			deny: "Deny",
			deniedTitle: "Screen Sharing Denied",
			deniedDescription:
				"You denied the screen sharing request. You can allow it below to continue.",
			tryAgain: "Try Again",
		},
	},
} as const

export type Locale = keyof typeof i18n
export type TranslationKeys = typeof i18n.en

const currentLocale: Locale = "en"

/**
 * Basic translation helper to retrieve localized strings.
 */
export function t<
	K1 extends keyof TranslationKeys,
	K2 extends keyof TranslationKeys[K1],
>(category: K1, key: K2, params?: Record<string, string | number>): string {
	let str = ((i18n[currentLocale][category] as Record<string, string>)[
		key as unknown as string
	] ??
		(i18n.en[category] as Record<string, string>)[key as unknown as string] ??
		"") as string

	if (params) {
		for (const [pKey, pVal] of Object.entries(params)) {
			str = str.replace(new RegExp(`\\{${pKey}\\}`, "g"), String(pVal))
		}
	}

	return str
}
