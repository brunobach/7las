import { useState, type ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Home01Icon, Logout03Icon, MinimizeScreenIcon, Settings02Icon, UserGroupIcon } from "@hugeicons/core-free-icons"
import { cn } from "cn"
import { Logo } from "@/components/logo"
import { ProfileDialog } from "@/components/profile-dialog"
import { UserAvatar } from "@/components/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { hideToTray } from "@/lib/desktop"
import type { AppSettings, AppView, Profile } from "@/types"

const items: { id: AppView; label: string; icon: typeof Home01Icon }[] = [
  { id: "home", label: "Início", icon: Home01Icon },
  { id: "room", label: "Sala atual", icon: UserGroupIcon },
  { id: "settings", label: "Configurações", icon: Settings02Icon },
]

export function AppShell({ view, onView, live, settings, profile, onSave, onSignOut, children }: {
  view: AppView
  settings: AppSettings
  profile: Profile
  onView: (view: AppView) => void
  onSave: (settings: AppSettings, username: string) => Promise<void>
  onSignOut: () => Promise<void>
  live: boolean
  children: ReactNode
}) {
  const [profileOpen, setProfileOpen] = useState(false)
  return (
    <div className="app-window grid grid-rows-[68px_minmax(0,1fr)]">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border/80 px-6 max-[700px]:px-4">
        <a className="skip-link" href="#content">Ir para o conteúdo</a>
        <Logo className="justify-self-start" />
        <nav className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/45 p-1" aria-label="Navegação principal">
          {items.map((item) => (
            <Button key={item.id} variant="ghost" size="sm" className={cn("relative h-8 px-3 text-muted-foreground", view === item.id && "bg-secondary text-foreground shadow-sm")} aria-current={view === item.id ? "page" : undefined} onClick={() => onView(item.id)}>
              <HugeiconsIcon icon={item.icon} data-icon="inline-start" />
              <span className="max-[700px]:sr-only">{item.label}</span>
              {item.id === "room" && live && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-live" aria-label="Ao vivo" />}
            </Button>
          ))}
        </nav>
        <div className="flex min-w-0 items-center justify-end gap-2">
          {live && <Badge variant="secondary" className="gap-2 max-[900px]:hidden"><span className="size-1.5 rounded-full bg-live" />Ao vivo</Badge>}
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Ocultar para a bandeja" onClick={() => void hideToTray()} />}><HugeiconsIcon icon={MinimizeScreenIcon} /></TooltipTrigger>
            <TooltipContent>Ocultar para a bandeja</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" className="h-auto max-w-48 gap-2.5 px-2 py-1.5" aria-label={`${settings.displayName}. Abrir menu da conta`} />}>
              <UserAvatar seed={settings.avatarSeed} name={settings.displayName} size="sm" />
              <span className="hidden min-w-0 text-left sm:block"><span className="block truncate text-sm">{settings.displayName}</span><span className="block truncate text-[11px] text-muted-foreground">@{profile.username}</span></span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup><DropdownMenuLabel><span className="block truncate text-foreground">{settings.displayName}</span><span className="mt-0.5 block truncate">@{profile.username}</span></DropdownMenuLabel></DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup><DropdownMenuItem onClick={() => setProfileOpen(true)}>Editar nome e avatar</DropdownMenuItem></DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup><DropdownMenuItem onClick={() => void onSignOut()}><HugeiconsIcon icon={Logout03Icon} />Sair da conta</DropdownMenuItem></DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main id="content" className="quiet-scrollbar min-h-0 overflow-y-auto" tabIndex={-1}>{children}</main>
      {profileOpen && <ProfileDialog open onOpenChange={setProfileOpen} settings={settings} profile={profile} onSave={onSave} />}
    </div>
  )
}
