import { HugeiconsIcon } from "@hugeicons/react"
import { NetworkIcon, UserGroupIcon } from "@hugeicons/core-free-icons"
import { UserAvatar } from "@/components/user-avatar"
import { Badge } from "@/components/ui/badge"
import type { ViewerInfo } from "@/media/media-session"
import type { AppSettings } from "@/types"

export function TreeVisual({ settings, viewers, live }: { settings: AppSettings; viewers: ViewerInfo[]; live: boolean }) {
  const byParent = new Map<string | null, ViewerInfo[]>()
  for (const viewer of viewers) byParent.set(viewer.parentId, [...(byParent.get(viewer.parentId) ?? []), viewer])
  const roots = viewers.filter((viewer) => !viewers.some((candidate) => candidate.id === viewer.parentId))
  const direct = roots

  return (
    <div className="rounded-xl border border-border bg-background/45 p-5" role="img" aria-label="Árvore de distribuição da sessão">
      <div className="flex items-center gap-3">
        <UserAvatar seed={settings.avatarSeed} name={settings.displayName} />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{settings.displayName} <span className="font-normal text-muted-foreground">(você)</span></p><p className="text-xs text-muted-foreground">Origem · {direct.length} saídas diretas</p></div>
        <Badge variant={live ? "default" : "secondary"}>{live ? "Origem ao vivo" : "Ocioso"}</Badge>
      </div>
      {roots.length > 0 && (
        <div className="relative ml-5 flex flex-col gap-3 pt-5 pl-7 before:absolute before:top-0 before:bottom-7 before:left-0 before:w-px before:bg-border">
          {roots.map((viewer) => <TreeNode key={viewer.id} viewer={viewer} viewers={viewers} live={live} />)}
        </div>
      )}
      {viewers.length === 0 && (
        <div className="mt-5 flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground"><HugeiconsIcon icon={UserGroupIcon} className="size-5" />Os espectadores entram aqui quando aceitam seu convite.</div>
      )}
    </div>
  )
}

function TreeNode({ viewer, viewers, live }: { viewer: ViewerInfo; viewers: ViewerInfo[]; live: boolean }) {
  const children = viewers.filter((item) => item.parentId === viewer.id)
  return (
    <div className="relative before:absolute before:top-6 before:-left-7 before:h-px before:w-7 before:bg-border">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
        <UserAvatar seed={viewer.avatar} name={viewer.name} size="sm" />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{viewer.name}</p><p className="text-xs text-muted-foreground">{viewer.route === "unknown" ? "Medindo rota" : viewer.route === "turn" ? "Rota TURN" : "Rota direta"}{viewer.bitrate !== null ? ` · ${(viewer.bitrate / 1_000_000).toFixed(1)} Mbps` : ""}</p></div>
        <Badge variant="secondary">{viewer.children.length ? "Retransmissão" : "Espectador"}</Badge>
        {live && viewer.children.length > 0 && <HugeiconsIcon icon={NetworkIcon} className="size-4 text-primary" />}
      </div>
      {children.length > 0 && <div className="relative ml-5 flex flex-col gap-3 pt-3 pl-7 before:absolute before:top-0 before:bottom-7 before:left-0 before:w-px before:bg-border">{children.map((child) => <TreeNode key={child.id} viewer={child} viewers={viewers} live={live} />)}</div>}
    </div>
  )
}
