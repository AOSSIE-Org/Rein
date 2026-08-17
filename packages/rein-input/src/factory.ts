import os from "node:os"
import type {
	InputConfig,
	PlatformInjector,
	TouchContact,
	MouseButton,
} from "./types"
import { DEFAULT_CONFIG } from "./constants"
import { WindowsInputInjector } from "./windows"
import { LinuxInputInjector } from "./linux"
import { MacInputInjector } from "./mac"

/**
 * Safe fallback injector for unsupported platforms or headless testing environments.
 */
export class StubInputInjector implements PlatformInjector {
	private config: InputConfig
	private onWarn?: (method: string) => void

	constructor(
		config: Partial<InputConfig> = {},
		onWarn?: (method: string) => void,
	) {
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.onWarn = onWarn
	}

	updateConfig(config: Partial<InputConfig>): void {
		this.config = { ...this.config, ...config }
	}

	injectMouseMove(_dx: number, _dy: number): void {
		this.warn("injectMouseMove")
	}

	injectMouseButton(_button: MouseButton, _isDown: boolean): void {
		this.warn("injectMouseButton")
	}

	injectMouseWheel(_dx: number, _dy: number): void {
		this.warn("injectMouseWheel")
	}

	injectKey(_key: string, _pos?: string): void {
		this.warn("injectKey")
	}

	injectCombo(_keys: string[]): void {
		this.warn("injectCombo")
	}

	injectText(_text: string): void {
		this.warn("injectText")
	}

	injectTouch(_contacts: TouchContact[]): void {
		this.warn("injectTouch")
	}

	destroy(): void {}

	private warn(method: string): void {
		if (this.onWarn) {
			this.onWarn(method)
		}
	}
}

export interface CreateInjectorOptions {
	config?: Partial<InputConfig>
	platform?: NodeJS.Platform | string
	onError?: (errorType: string, message: string) => void
}

/**
 * Universal factory to create the appropriate PlatformInjector for the current OS.
 *
 * @param options Configuration options, custom platform override, and error callback.
 * @returns An initialized PlatformInjector or StubInputInjector.
 */
export function createInputInjector(
	options: Partial<InputConfig> | CreateInjectorOptions = {},
): PlatformInjector {
	const opts: CreateInjectorOptions =
		"sensitivity" in options ||
		"screenWidth" in options ||
		"invertScroll" in options
			? { config: options as Partial<InputConfig> }
			: (options as CreateInjectorOptions)

	const platform = opts.platform ?? os.platform()
	const config = opts.config ?? {}

	try {
		if (platform === "win32") {
			return new WindowsInputInjector(config)
		}
		if (platform === "linux") {
			return new LinuxInputInjector(config)
		}
		if (platform === "darwin") {
			return new MacInputInjector(config)
		}

		const msg = `Unsupported platform: ${platform}`
		console.warn(`[createInputInjector] ${msg}`)
		opts.onError?.("unsupported-platform", msg)
		return new StubInputInjector(config)
	} catch (err) {
		const errMsg = `Input injector initialization failed: ${err instanceof Error ? err.message : String(err)}`
		console.warn(`[createInputInjector] ${errMsg}`)
		opts.onError?.("input-injector-init-failed", errMsg)
		return new StubInputInjector(config)
	}
}
