"use client"

export const fallbackWriteClipboard = (text: string): void => {
	let textArea: HTMLTextAreaElement | null = null

	try {
		textArea = document.createElement("textarea")
		textArea.value = text
		textArea.setAttribute("readonly", "")

		textArea.style.position = "fixed"
		textArea.style.opacity = "0"
		textArea.style.pointerEvents = "none"

		document.body.appendChild(textArea)
		textArea.focus()
		textArea.select()

		document.execCommand("copy")
	} catch (err) {
		console.warn("Fallback clipboard write failed:", err)
	} finally {
		if (textArea && document.body.contains(textArea)) {
			document.body.removeChild(textArea)
		}
	}
}

export const writeToClipboard = async (text: string): Promise<void> => {
	try {
		if (navigator.clipboard && window.isSecureContext) {
			await navigator.clipboard.writeText(text)
		} else {
			fallbackWriteClipboard(text)
		}
	} catch (err) {
		console.warn("Clipboard API write failed, using fallback:", err)
		fallbackWriteClipboard(text)
	}
}
