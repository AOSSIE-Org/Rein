"use client"

import { RefreshCw, WifiOff } from "lucide-react"
import { t } from "../../utils/i18n"

interface ErrorComponentProps {
	error: string
	errorHandle: string
	onReconnect: () => void
}

export const ErrorComponent = ({
	error,
	errorHandle,
	onReconnect,
}: ErrorComponentProps) => {
	return (
		<div className="absolute inset-0 flex items-center justify-center bg-black/40 overflow-hidden select-none touch-none">
			<div className="w-full h-full place-content-center p-6 bg-base-300/90 shadow-2xl flex flex-col items-center text-center gap-6 duration-300">
				<div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-error/10 text-error">
					<WifiOff className="w-8 h-8" />
					<div className="absolute inset-0 rounded-full bg-error/5 animate-ping" />
				</div>

				<div className="space-y-2">
					<h3 className="text-xl font-bold text-base-content">
						{errorHandle || t("errorComponent", "unknownError")}
					</h3>
					<p className="text-sm text-base-content/70 max-h-24 overflow-y-auto px-2">
						{error || t("errorComponent", "unexpectedNetworkError")}
					</p>
				</div>
				<div className="divider my-0 opacity-40" />
				<div className="space-y-4 w-full">
					<button
						type="button"
						onClick={onReconnect}
						className="btn btn-block btn-primary gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
					>
						<RefreshCw className="w-4 h-4" />
						{t("errorComponent", "reconnect")}
					</button>
				</div>
			</div>
		</div>
	)
}
