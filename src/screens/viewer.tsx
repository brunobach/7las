import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Home01Icon, Logout03Icon, ScreenShareIcon, StopIcon, VolumeHighIcon, VolumeOffIcon } from "@hugeicons/core-free-icons"
import { cn } from "cn"
import { AudioToggle } from "@/components/audio-toggle"
import { ParticipantsPanel } from "@/components/participants-panel"
import { ScreenStage, useTheaterMode } from "@/components/screen-stage"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import type { MediaSession } from "@/media/media-session"

const STATUS_LABEL = {
  connecting: "Conectando",
  waiting: "Aguardando",
  live: "Ao vivo",
  reconnecting: "Reconectando",
  ended: "Encerrada",
} as const

export function ViewerScreen({ session, audio, onAudioChange, onStop, onShare, onStopSharing }: {
  session: MediaSession | null
  audio: boolean
  onAudioChange: (enabled: boolean) => void
  onStop: () => void
  onShare: () => void
  onStopSharing: () => void
}) {
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(80)
  const [theater, setTheater] = useTheaterMode()

  if (!session || session.role !== "viewer") return null
  const host = session.participants.find((item) => item.role === "host")
  const hostName = host?.name ?? "o anfitrião"

  if (session.status === "ended") {
    return (
      <div className="flex min-h-full items-center justify-center p-7">
        <Empty className="max-w-lg border border-border bg-card/40">
          <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={StopIcon} /></EmptyMedia><EmptyTitle>A sala foi fechada</EmptyTitle><EmptyDescription>{hostName} fechou a sala ou saiu. Para voltar, peça um código novo.</EmptyDescription></EmptyHeader>
          <EmptyContent><Button onClick={onStop}><HugeiconsIcon icon={Home01Icon} data-icon="inline-start" />Voltar ao início</Button></EmptyContent>
        </Empty>
      </div>
    )
  }

  const via = session.parentId && session.parentId !== session.hostId ? ` (repassado por ${session.parentName})` : ""
  const waiting = session.status === "waiting"
    ? `${hostName} ainda não está compartilhando. A tela aparece aqui assim que alguém começar.`
    : session.status === "reconnecting" ? "Reconectando ao vídeo…" : `Conectando à tela de ${hostName}…`
  const sharing = session.sharing

  return (
    <div className={cn("mx-auto flex w-full flex-col gap-5 p-7", theater ? "max-w-[1600px]" : "max-w-[1180px]")}>
      <section className="app-enter flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><h1 className="font-heading text-2xl font-medium tracking-[-0.04em]">Sala de {hostName}</h1><Badge variant={session.status === "live" ? "default" : "secondary"}>{STATUS_LABEL[session.status]}</Badge></div>
          <p className="mt-1.5 text-sm text-muted-foreground">{session.status === "live" ? `Você está assistindo${via}` : session.status === "waiting" ? "Você já está na sala." : "Isso costuma levar alguns segundos."}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {sharing
            ? <Button variant="outline" onClick={onStopSharing}><HugeiconsIcon icon={StopIcon} data-icon="inline-start" />Parar de compartilhar</Button>
            : <><AudioToggle enabled={audio} onChange={onAudioChange} /><Button variant="outline" onClick={onShare}><HugeiconsIcon icon={ScreenShareIcon} data-icon="inline-start" />Compartilhar minha tela</Button></>}
          <Button variant="outline" onClick={onStop}><HugeiconsIcon icon={Logout03Icon} data-icon="inline-start" />Sair</Button>
        </div>
      </section>
      {session.error && <Alert variant="destructive"><AlertTitle>Não conseguimos conectar</AlertTitle><AlertDescription>{session.error}</AlertDescription></Alert>}
      <div className={cn("items-start gap-5", theater ? "flex flex-col" : "grid grid-cols-[minmax(0,1fr)_260px]")}>
        <div className="w-full min-w-0">
          <ScreenStage
            screens={session.screens}
            theater={theater}
            onTheaterChange={setTheater}
            muted={muted}
            volume={volume / 100}
            empty={<div className="flex size-full flex-col items-center justify-center gap-4 p-6">{session.status !== "waiting" && <Spinner className="size-6" />}<p className="max-w-sm text-center text-sm text-muted-foreground">{waiting}</p></div>}
            toolbar={(
              <>
                <Button variant="ghost" size="icon-sm" aria-label={muted ? "Ativar som" : "Silenciar"} onClick={() => setMuted((value) => !value)}><HugeiconsIcon icon={muted ? VolumeOffIcon : VolumeHighIcon} /></Button>
                <Slider aria-label="Volume" className="max-w-40" value={[volume]} onValueChange={(value) => setVolume(Array.isArray(value) ? value[0] : value)} />
                <span className="w-10 text-xs text-muted-foreground tabular-nums">{volume}%</span>
              </>
            )}
          />
        </div>
        <div className={cn(theater && "grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 max-[860px]:grid-cols-1")}>
          <ParticipantsPanel participants={session.participants} />
        </div>
      </div>
      {session.childIds.length > 0 && (
        <p className="text-xs text-muted-foreground">Você está ajudando a repassar o vídeo para {session.childIds.length} {session.childIds.length === 1 ? "pessoa" : "pessoas"}.</p>
      )}
    </div>
  )
}
