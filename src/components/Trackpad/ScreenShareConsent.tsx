"use client"

import { useState } from "react"
import { ScreenShare, ShieldAlert } from "lucide-react"
import { t } from "../../utils/i18n"

interface ScreenShareConsentProps {
	onAllow: () => void
}

export const ScreenShareConsent = ({ onAllow }: ScreenShareConsentProps) => {
	const [denied, setDenied] = useState(false)

	return (
		<div className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden select-none touch-none">
			<div className="w-full h-full place-content-center p-6 bg-base-300 shadow-2xl flex flex-col items-center text-center gap-6 duration-300">
				<div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary">
					{denied ? (
						<ShieldAlert className="w-8 h-8" />
					) : (
						<ScreenShare className="w-8 h-8" />
					)}
				</div>

				<div className="space-y-2">
					<h3 className="text-xl font-bold text-base-content">
						{denied
							? t("screenShareConsent", "deniedTitle")
							: t("screenShareConsent", "title")}
					</h3>
					<p className="text-sm text-base-content/70 max-w-sm px-2">
						{denied
							? t("screenShareConsent", "deniedDescription")
							: t("screenShareConsent", "description")}
					</p>
				</div>
				<div className="divider my-0 opacity-40" />
				<div className="space-y-3 w-full max-w-xs">
					<button
						type="button"
						onClick={onAllow}
						className="btn btn-block btn-primary gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
					>
						<ScreenShare className="w-4 h-4" />
						{denied
							? t("screenShareConsent", "tryAgain")
							: t("screenShareConsent", "allow")}
					</button>
					{!denied && (
						<button
							type="button"
							onClick={() => setDenied(true)}
							className="btn btn-block btn-ghost"
						>
							{t("screenShareConsent", "deny")}
						</button>
					)}
				</div>
			</div>
		</div>
	)
}
