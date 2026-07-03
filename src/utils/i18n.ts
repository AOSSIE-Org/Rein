/**
 * Lightweight internationalization resource layer.
 */

export const i18n = {
	en: {
		settings: {
			copyLink: "Copy Link",
			copied: "Copied!",
			copyFailed: "Could not copy the link automatically. Please copy it manually.",
		},
		screenMirror: {
			ariaLabel: "Remote desktop screen share",
			connecting: "Connecting to host...",
			disconnected: "Disconnected from host",
			connectedButNoVideo: "Establishing stream...",
			establishingSecure: "Establishing secure connection",
			settingUpScreen: "Setting up screen sharing",
			checkNetwork: "Attempting to connect to the host.",
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
>(category: K1, key: K2): string {
	return (
		(i18n[currentLocale][category] as Record<string, string>)[
			key as unknown as string
		] ??
		(i18n.en[category] as Record<string, string>)[key as unknown as string] ??
		""
	)
}
