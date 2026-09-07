declare const __APP_VERSION__: string
declare const __FRONTEND_PORT__: string
export const APP_CONFIG = {
	SITE_NAME: "Rein",
	SITE_DESCRIPTION: "Remote controller for your PC",
	REPO_URL: "https://github.com/imxade/rein",
	THEME_STORAGE_KEY: "rein-theme",
	VERSION: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.1.0",
	PORT: typeof __FRONTEND_PORT__ !== "undefined" ? __FRONTEND_PORT__ : "0.1.0",
}

export const THEMES = {
	LIGHT: "cupcake",
	DARK: "dracula",
	DEFAULT: "dracula",
}
