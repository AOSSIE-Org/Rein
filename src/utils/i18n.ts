/**
 * Lightweight internationalization resource layer.
 */

export const i18n = {
	en: {
		nav: {
			trackpad: "Trackpad",
			settings: "Settings",
			sendFile: "Send Files",
		},
		themePicker: {
			selectTheme: "Select {theme} theme",
			themes: {
				dracula: "Dracula",
				night: "Night",
				sunset: "Sunset",
				forest: "Forest",
				cupcake: "Cupcake",
				nord: "Nord",
				lofi: "Lo-Fi",
				lemonade: "Lemonade",
			},
		},
		clientTab: {
			mouseSensitivity: "Mouse Sensitivity",
			slow: "Slow",
			default: "Default",
			fast: "Fast",
			invertScroll: "Invert Scroll",
			traditionalScrolling: "Traditional scrolling enabled",
			naturalScrolling: "Natural scrolling",
			theme: "Theme",
		},
		serverTab: {
			streamQuality: "Stream Quality",
			qualityPerformance: "Performance",
			qualityPerformanceDesc:
				"Ultrafast encode \u00b7 Best for low-end hardware",
			qualityBalanced: "Balanced",
			qualityBalancedDesc: "Superfast encode \u00b7 Good quality & latency",
			qualityQuality: "Quality",
			qualityQualityDesc: "Fast encode \u00b7 Best visual fidelity",
			limitFramerate: "Limit Frame Rate",
			noLimit: "No Limit",
			serverIp: "Server IP (for Remote)",
			lanIpHelp: "This Computer's LAN IP",
			port: "Port",
			firewallAlert:
				"Important: Ensure port {port} is allowed in your computer's firewall!",
			restartWarningAlert:
				"Important: Any changes made to the server requires a restart and clicking save config will restart the server!",
			restartRequired:
				"Server config saved. Please restart Rein for the changes to take effect.",
			saveConfig: "Save Config",
			saving: "Saving\u2026",
			invalidPortAlert: "Please enter a valid port number (1\u201365535).",
		},
		controlBar: {
			scrollMode: "Toggle scroll",
			leftClick: "Left click",
			rightClick: "Right click",
			copy: "Copy",
			paste: "Paste",
			keyboard: "Keyboard",
			modifier: "Modifier",
		},
		settings: {
			title: "Settings",
			clientTab: "Client Settings",
			serverTab: "Server Settings",
			copy: "Copy",
			copied: "Copied to Clipboard!",
			appVersion: "Rein Remote v{version}",
			copyFailed:
				"Could not copy the link automatically. Please copy it manually.",
			noOnscreenKeyboard: "No on-screen keyboard found",
			connectMobile: "Connect Mobile",
			scanQr: "Scan to open remote",
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
			mouseLockedHint: "Mouse locked. Press {key} to unlock.",
			enterFullscreen: "Enter Fullscreen",
			exitFullscreen: "Exit Fullscreen",
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
