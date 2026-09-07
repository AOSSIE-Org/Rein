import { CheckCircle2 } from "lucide-react"
import type { FC } from "react"
import { i18n, t } from "../../utils/i18n"

export interface ThemeEntry {
	value: keyof typeof i18n.en.themePicker.themes
	isDark: boolean
}

// All supported themes. Add new custom themes here — the preview renders
// automatically by applying data-theme to each card div.
export const THEME_LIST: ThemeEntry[] = [
	{ value: "dracula", isDark: true },
	{ value: "night", isDark: true },
	{ value: "sunset", isDark: true },
	{ value: "forest", isDark: true },
	{ value: "cupcake", isDark: false },
	{ value: "nord", isDark: false },
	{ value: "lofi", isDark: false },
	{ value: "lemonade", isDark: false },
]

interface ThemePickerProps {
	value: string
	onChange: (theme: string) => void
}

const ThemePicker: FC<ThemePickerProps> = ({ value, onChange }) => {
	return (
		<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
			{THEME_LIST.map((entry) => {
				const isSelected = value === entry.value
				const label = i18n.en.themePicker.themes[entry.value] ?? entry.value
				return (
					<button
						type="button"
						key={entry.value}
						data-theme={entry.value}
						onClick={() => onChange(entry.value)}
						title={label}
						aria-label={t("themePicker", "selectTheme", { theme: label })}
						aria-pressed={isSelected}
						className={[
							"relative flex flex-col gap-1 p-2 rounded-xl cursor-pointer border-2 transition-all duration-150",
							"bg-base-100 w-full min-w-0 items-center hover:scale-105 active:scale-95",
							isSelected
								? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-base-100"
								: "border-base-300 hover:border-primary/60",
						].join(" ")}
					>
						{/* Color swatch row showing primary/secondary/accent/neutral */}
						<div className="flex w-full gap-0.5 rounded-md overflow-hidden h-5">
							<div className="flex-1 bg-primary" />
							<div className="flex-1 bg-secondary" />
							<div className="flex-1 bg-accent" />
							<div className="flex-1 bg-neutral" />
						</div>
						{/* Theme name */}
						<span className="text-xs font-medium text-base-content mt-0.5 truncate w-full text-center">
							{label}
						</span>
						{isSelected && (
							<div className="absolute top-1 right-1 w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center">
								<CheckCircle2 />
							</div>
						)}
					</button>
				)
			})}
		</div>
	)
}

export default ThemePicker
