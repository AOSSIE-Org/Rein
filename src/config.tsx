import serverConfig from './server-config.json';

export const APP_CONFIG = {
    SITE_NAME: "Rein",
    SITE_DESCRIPTION: "Remote controller for your PC",
    REPO_URL: "https://github.com/imxade/rein",
    THEME_STORAGE_KEY: "rein-theme",
}

export const THEMES = {
    LIGHT: 'cupcake',
    DARK: 'dracula',
    DEFAULT: 'dracula',
}

export const CONFIG = {
    // Port for the Vite Frontend
    FRONTEND_PORT: serverConfig.frontendPort,
    MOUSE_INVERT: serverConfig.mouseInvert ?? false,
    // Default to 1.0 if not set
    MOUSE_SENSITIVITY: serverConfig.mouseSensitivity ?? 1.0
};
