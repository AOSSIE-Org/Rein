import serverConfig from "./server-config.json";

/**
 * Server config (server-config.json): only host, frontendPort, address are writable via Save Config.
 * Client settings (mouse sensitivity, invert scroll, theme) are stored in localStorage only.
 */
export const APP_CONFIG = {
	SITE_NAME: "Rein",
	SITE_DESCRIPTION: "Remote controller for your PC",
	REPO_URL: "https://github.com/imxade/rein",
	THEME_STORAGE_KEY: "rein-theme",
};

export const THEMES = {
	LIGHT: "cupcake",
	DARK: "dracula",
	DEFAULT: "dracula",
};

/** Config from server-config.json. Only host, frontendPort, address are writable via Settings Save. */
export const CONFIG = {
	FRONTEND_PORT: serverConfig.frontendPort ?? 3000,
	MOUSE_INVERT: serverConfig.mouseInvert ?? false,
	MOUSE_SENSITIVITY: serverConfig.mouseSensitivity ?? 1.0,
};
