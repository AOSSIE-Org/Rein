"use client"
import { Link } from "@tanstack/react-router"
import { Compass } from "lucide-react"
import { t } from "@/utils/i18n"

export function NotFound() {
	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex max-w-md flex-col items-center text-center">
				<p className="text-7xl font-black tracking-tight text-primary sm:text-8xl">
					{t("notFound", "code")}
				</p>
				<h1 className="mt-4 text-xl font-semibold text-base-content sm:text-2xl">
					{t("notFound", "title")}
				</h1>
				<p className="mt-2 text-sm text-base-content/60 sm:text-base">
					{t("notFound", "description")}
				</p>
				<Link
					to="/trackpad"
					id="not-found-home-link"
					className="btn btn-primary mt-6 gap-2"
				>
					<Compass className="h-4 w-4 shrink-0" aria-hidden="true" />
					{t("notFound", "backToApp")}
				</Link>
			</div>
		</div>
	)
}
