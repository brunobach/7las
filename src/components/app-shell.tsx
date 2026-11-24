import type { ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { DashboardSquare01Icon, MinimizeScreenIcon, Settings02Icon, UserGroupIcon } from "@hugeicons/core-free-icons"
import { cn } from "cn"
import { Logo } from "@/components/logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { hideToTray } from "@/lib/desktop"
import type { AppView } from "@/types"

const items: { id: AppView; label: string; icon: typeof DashboardSquare01Icon }[] = [
  { id: "home", label: "Início", icon: DashboardSquare01Icon },
  { id: "room", label: "Minha sala", icon: UserGroupIcon },
  { id: "settings", label: "Configurações", icon: Settings02Icon },
]

export function AppShell({ view, onView, live, title, subtitle, displayName, children }: {
  view: AppView
  displayName: string
  onView: (view: AppView) => void
  live: boolean
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="app-window grid grid-cols-[220px_minmax(0,1fr)] grid-rows-[72px_minmax(0,1fr)]">
      <aside className="row-span-2 flex flex-col border-r border-border bg-sidebar px-4 py-5">
        <a className="skip-link" href="#content">Ir para o conteúdo</a>
        <Logo className="px-2" />
        <nav className="mt-8 flex flex-col gap-1" aria-label="Navegação principal">
          {items.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              className={cn("h-11 justify-start rounded-xl px-3 text-muted-foreground", view === item.id && "bg-secondary text-foreground")}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => onView(item.id)}
            >
              <HugeiconsIcon icon={item.icon} data-icon="inline-start" />
              {item.label}
              {item.id === "room" && live && <span className="ml-auto size-2 rounded-full bg-primary" aria-label="Ao vivo" />}
            </Button>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-background/50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className={cn("size-2 rounded-full", live ? "bg-primary" : "bg-muted-foreground")} />
              {live ? "Compartilhando agora" : "Pronto para compartilhar"}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {live ? "Pode minimizar: a transmissão continua." : "Fechar a janela deixa o 7las na bandeja."}
            </p>
          </div>
          <div className="flex items-center gap-3 px-1">
            <Avatar size="sm"><AvatarFallback>{displayName.trim().slice(0, 1).toUpperCase() || "?"}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">Seu nome na sala</p>
            </div>
          </div>
        </div>
      </aside>
      <header className="flex items-center justify-between border-b border-border px-7">
        <div>
          <p className="font-heading text-base font-medium tracking-[-0.025em]">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {live && <Badge variant="secondary" className="h-7 gap-2 px-3"><span className="size-1.5 rounded-full bg-primary" />Ao vivo</Badge>}
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Ocultar para a bandeja" onClick={() => void hideToTray()} />}>
              <HugeiconsIcon icon={MinimizeScreenIcon} />
            </TooltipTrigger>
            <TooltipContent>Ocultar para a bandeja</TooltipContent>
          </Tooltip>
        </div>
      </header>
      <main id="content" className="quiet-scrollbar min-h-0 overflow-y-auto" tabIndex={-1}>{children}</main>
    </div>
  )
}
