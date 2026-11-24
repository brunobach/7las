import { useState, type ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { DashboardSquare01Icon, MinimizeScreenIcon, Settings02Icon, UserGroupIcon } from "@hugeicons/core-free-icons"
import { cn } from "cn"
import { Logo } from "@/components/logo"
import { ProfileDialog } from "@/components/profile-dialog"
import { UserAvatar } from "@/components/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { hideToTray } from "@/lib/desktop"
import type { AppSettings, AppView } from "@/types"

const items: { id: AppView; label: string; icon: typeof DashboardSquare01Icon }[] = [
  { id: "home", label: "Início", icon: DashboardSquare01Icon },
  { id: "room", label: "Minha sala", icon: UserGroupIcon },
  { id: "settings", label: "Configurações", icon: Settings02Icon },
]

export function AppShell({ view, onView, live, title, subtitle, settings, onSave, children }: {
  view: AppView
  settings: AppSettings
  onView: (view: AppView) => void
  onSave: (settings: AppSettings) => Promise<void>
  live: boolean
  title: string
  subtitle: string
  children: ReactNode
}) {
  const [profileOpen, setProfileOpen] = useState(false)
  return (
    <div className="app-window grid grid-cols-[200px_minmax(0,1fr)] grid-rows-[64px_minmax(0,1fr)]">
      <aside className="row-span-2 flex flex-col border-r border-border bg-sidebar px-3 py-4">
        <a className="skip-link" href="#content">Ir para o conteúdo</a>
        <Logo className="px-2" />
        <nav className="mt-8 flex flex-col gap-1" aria-label="Navegação principal">
          {items.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              className={cn("h-10 justify-start px-3 text-muted-foreground", view === item.id && "bg-secondary text-foreground")}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => onView(item.id)}
            >
              <HugeiconsIcon icon={item.icon} data-icon="inline-start" />
              {item.label}
              {item.id === "room" && live && <span className="ml-auto size-2 rounded-full bg-live" aria-label="Ao vivo" />}
            </Button>
          ))}
        </nav>
        <div className="mt-auto px-3 pb-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className={cn("size-1.5 rounded-full", live ? "bg-live" : "bg-muted-foreground")} />
            {live ? "Compartilhando agora" : "Pronto para compartilhar"}
          </div>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            {live ? "Pode minimizar. A transmissão continua na bandeja." : "Fechar a janela deixa o 7las na bandeja."}
          </p>
        </div>
      </aside>
      <header className="flex items-center justify-between gap-4 border-b border-border px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {live && <Badge variant="secondary" className="h-7 gap-2 px-2.5"><span className="size-1.5 rounded-full bg-live" />Ao vivo</Badge>}
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" className="h-auto max-w-44 gap-2.5 px-2 py-1.5" aria-label={`${settings.displayName}. Editar perfil`} onClick={() => setProfileOpen(true)} />}>
              <UserAvatar seed={settings.avatarSeed} name={settings.displayName} size="sm" />
              <span className="truncate text-sm">{settings.displayName}</span>
            </TooltipTrigger>
            <TooltipContent>Editar nome e avatar</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Ocultar para a bandeja" onClick={() => void hideToTray()} />}>
              <HugeiconsIcon icon={MinimizeScreenIcon} />
            </TooltipTrigger>
            <TooltipContent>Ocultar para a bandeja</TooltipContent>
          </Tooltip>
        </div>
      </header>
      <main id="content" className="quiet-scrollbar min-h-0 overflow-y-auto" tabIndex={-1}>{children}</main>
      {profileOpen && <ProfileDialog open onOpenChange={setProfileOpen} settings={settings} onSave={onSave} />}
    </div>
  )
}
