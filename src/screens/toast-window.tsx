import { useEffect, useState } from "react"
import { emit, listen } from "@tauri-apps/api/event"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import type { ToastItem } from "@/lib/desktop"

/**
 * Conteúdo da janelinha de aviso no canto da tela. Quem decide o que mostrar é a janela
 * principal; aqui só exibimos e devolvemos a resposta (aceitar/recusar).
 */
export function ToastWindow() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    document.documentElement.classList.add("toast-window")
    const off = listen<ToastItem[]>("toast://items", (event) => setItems(event.payload))
    void off.then(() => emit("toast://ready"))
    return () => {
      void off.then((unlisten) => unlisten())
    }
  }, [])

  const answer = (id: string, accept: boolean) => {
    setItems((current) => current.filter((item) => item.id !== id))
    void emit("toast://answer", { id, accept })
  }

  return (
    <div className="flex h-svh flex-col gap-2 overflow-hidden border border-border bg-popover p-3 text-popover-foreground">
      <div className="flex items-center justify-between">
        <Logo compact className="scale-75 origin-left" />
        <span className="text-xs text-muted-foreground">7las</span>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" aria-live="assertive">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-medium">{item.title}</p>
            {item.body && <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>}
            <div className="mt-2.5 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => answer(item.id, false)}>{item.deny}</Button>
              <Button size="sm" onClick={() => answer(item.id, true)}>{item.accept}</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
