import { isTauri } from "@/lib/desktop"

/**
 * No app de desktop, "Atualizar" (menu do botão direito, F5, Ctrl+R) derruba a sala sem avisar ninguém.
 * Bloqueamos esses atalhos e o menu do navegador; em campos de texto o menu continua (copiar/colar).
 */
export function installDesktopGuards(): () => void {
  if (!isTauri) return () => undefined
  const isEditable = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, [contenteditable='true']") !== null)
  const onContextMenu = (event: MouseEvent) => {
    if (!isEditable(event.target)) event.preventDefault()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase()
    const reload = key === "f5" || ((event.ctrlKey || event.metaKey) && key === "r")
    if (reload) event.preventDefault()
  }
  window.addEventListener("contextmenu", onContextMenu)
  window.addEventListener("keydown", onKeyDown, true)
  return () => {
    window.removeEventListener("contextmenu", onContextMenu)
    window.removeEventListener("keydown", onKeyDown, true)
  }
}
