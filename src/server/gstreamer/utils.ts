/**
 * Wayland D-Bus and PipeWire screen cast portal utilities.
 *
 * Implements the Desktop Portal ScreenCast specification via D-Bus
 * to request a PipeWire video stream node from the Wayland compositor.
 */

import logger from "../../utils/logger.ts"
import { generateToken } from "../tokenStore.ts"
import type * as DBus from "dbus-next"
import type { Message } from "dbus-next"

declare module "dbus-next" {
	interface MessageBus {
		name: string | null
		on(event: "close", listener: () => void): this
	}
}

type SessionBus = ReturnType<typeof DBus.sessionBus>

export class ImplementDbus {
	private sessionPath: string | null = null
	public dbusConnection: SessionBus | null = null
	private dbusModule: typeof import("dbus-next") | null = null
	public pipewireNodeId: number | null = null
	public onFailure?: (err: Error) => void

	public async dispose() {
		this.onFailure = undefined
		if (this.sessionPath && this.dbusConnection) {
			try {
				const portalDest = "org.freedesktop.portal.Desktop"
				const sessionObj = await this.dbusConnection.getProxyObject(
					portalDest,
					this.sessionPath,
				)
				const sessionInterface = sessionObj.getInterface(
					"org.freedesktop.portal.Session",
				)
				await sessionInterface.Close()
			} catch {}
		}
		this.sessionPath = null
		this.pipewireNodeId = null
		if (this.dbusConnection) {
			try {
				this.dbusConnection.disconnect()
			} catch {}
			this.dbusConnection = null
		}
	}
	public async initializeDbus() {
		this.dbusModule = await import("dbus-next")
		this.dbusConnection = this.dbusModule.sessionBus()
		logger.info("D-Bus session bus initialized")

		this.dbusConnection.on("error", (err: Error) => {
			logger.error(`DBus error: ${err.stack}`)
			if (this.onFailure) {
				this.onFailure(err)
			}
		})

		this.dbusConnection.on("close", () => {
			logger.error("DBus connection closed")
			if (this.onFailure) {
				this.onFailure(new Error("Wayland D-Bus connection closed"))
			}
		})
		await this.negotiateScreenCastPortal()
	}

	private async waitForPortalResponse(
		requestPath: string,
	): Promise<Record<string, DBus.Variant>> {
		return Promise.race([
			new Promise<Record<string, DBus.Variant>>((resolve, reject) => {
				if (!this.dbusConnection) return
				const handler = (msg: Message) => {
					if (msg.path !== requestPath) return
					if (msg.interface !== "org.freedesktop.portal.Request") return
					if (msg.member !== "Response") return
					this.dbusConnection?.removeListener("message", handler)

					const [responseCode, results] = msg.body
					if (responseCode === 0) resolve(results)
					else if (responseCode === 1)
						reject(new Error("User cancelled the Wayland screen cast prompt"))
					else
						reject(
							new Error(
								`Portal request failed with response code: ${responseCode}`,
							),
						)
				}
				this.dbusConnection.on("message", handler)
			}),
			new Promise<Record<string, DBus.Variant>>((_, reject) =>
				setTimeout(() => reject(new Error("Portal request timeout")), 30000),
			),
		])
	}
	private getDbusId(): string | null {
		if (!this.dbusConnection) return null
		const uniqueName: string = this.dbusConnection.name ?? ""
		// ":1.88" -> "1_88"
		return uniqueName.replace(":", "").replace(/\./g, "_")
	}

	private async negotiateScreenCastPortal(): Promise<void> {
		if (!this.dbusConnection || !this.dbusModule) return
		const portalDest = "org.freedesktop.portal.Desktop"
		const portalPath = "/org/freedesktop/portal/desktop"
		const obj = await this.dbusConnection.getProxyObject(portalDest, portalPath)
		const screenCast = obj.getInterface("org.freedesktop.portal.ScreenCast")
		// 1. Create Session
		const token = generateToken().replaceAll("-", "_")
		const sessionResponsePromise = this.waitForPortalResponse(
			`/org/freedesktop/portal/desktop/request/${this.getDbusId()}/rein_create_req_${token}`,
		)
		await screenCast.CreateSession({
			session_handle_token: new this.dbusModule.Variant(
				"s",
				`rein_session_${token}`,
			),
			handle_token: new this.dbusModule.Variant(
				"s",
				`rein_create_req_${token}`,
			),
		})
		const sessionResults = await sessionResponsePromise
		this.sessionPath = sessionResults.session_handle.value

		if (!this.sessionPath) {
			throw new Error(
				"Failed to obtain a valid Wayland ScreenCast session path",
			)
		}

		try {
			const sessionObj = await this.dbusConnection.getProxyObject(
				portalDest,
				this.sessionPath,
			)
			const sessionInterface = sessionObj.getInterface(
				"org.freedesktop.portal.Session",
			)
			sessionInterface.on("Closed", (results: unknown) => {
				logger.warn(
					`Wayland session closed via portal: ${JSON.stringify(results)}`,
				)
				if (this.onFailure) {
					this.onFailure(
						new Error("Wayland screen cast session closed by portal"),
					)
				}
			})
		} catch (err) {
			logger.error(
				`Failed to listen to Wayland session Closed signal: ${err instanceof Error ? err.message : String(err)}`,
			)
		}

		// 2. Select Sources
		const selectToken = "rein_select_req"
		const selectResponsePromise = this.waitForPortalResponse(
			`/org/freedesktop/portal/desktop/request/${this.getDbusId()}/${selectToken}`,
		)
		await screenCast.SelectSources(this.sessionPath, {
			multiple: new this.dbusModule.Variant("b", false),
			types: new this.dbusModule.Variant("u", 1),
			handle_token: new this.dbusModule.Variant("s", selectToken),
		})
		await selectResponsePromise

		// 3. Start Session
		const startToken = "rein_start_req"
		const startResponsePromise = this.waitForPortalResponse(
			`/org/freedesktop/portal/desktop/request/${this.getDbusId()}/${startToken}`,
		)
		await screenCast.Start(this.sessionPath, "", {
			// <-- "" is the parent window handle
			handle_token: new this.dbusModule.Variant("s", startToken),
		})
		const startResults = await startResponsePromise

		const streamsVariant = startResults.streams
		if (streamsVariant?.value && streamsVariant?.value.length > 0) {
			this.pipewireNodeId = streamsVariant.value[0][0]
			logger.info(
				`Wayland Portal negotiated. PipeWire Node: ${this.pipewireNodeId}`,
			)
		} else {
			throw new Error("No screen cast streams returned by the Wayland portal.")
		}
	}
}
